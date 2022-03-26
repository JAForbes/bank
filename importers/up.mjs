#!./node_modules/.bin/zx
import papa from 'papaparse'
import postgres from 'postgres'
import path from 'path'

import dotenv from 'dotenv'
dotenv.config()

const sql = postgres(`${process.env.CLUSTER_URL}/${process.env.PGDATABASE}`, {
    max: 1
})

console.log(`${process.env.CLUSTER_URL}/${process.env.PGDATABASE}`)

const [{bank_id}] = await sql`select bank_id from bank where name = 'Up'`

const filenames = argv._.filter( x => x.endsWith('.csv') )
let transactions = []
let accounts = new Set()
for( let filepath of filenames ) {
    
    const contents = (await fs.readFile(filepath)).toString('utf8')

    const { data: rows } = papa.parse(contents, {
        dynamicTyping: false
        ,header: true
    })

    let account_no;
    // For up, we assume accounts are segretated files because the upname is not in the csv file
    // just the account no, and having the upname is great
    if( rows.length){
        const [account_name] = path.parse(filepath).dir.split('/').reverse()
        const account_holder = account_name
        account_no = rows[0]['BSB / Account Number']

        accounts.add(
            JSON.stringify({ 
                account_no, account_name, account_holder, bank_id 
            }) 
        )
    }

    let dateIndex = {}
    for (let row of rows){
        if (row['Total (AUD)'] == null) continue;

        let {
            Time: created_at,
            'BSB / Account Number': account_no,
            'Transaction Type': transaction_type,
            Payee: payee,
            Description: description,
            Category: category,
            Tags: tags,
            'Subtotal (AUD)': subtotal_aud,
            Currency: currency,
            'Fee (AUD)': fee_aud,
            'Round Up (AUD)': round_up,
            'Total (AUD)': total_aud,
            'Payment Method': payment_method,
            'Settled Date': settled_date
        } = row

        let date = new Date(created_at)
        let dateKey = [date.getDate(),date.getMonth(),date.getFullYear()].join('/')

        if(!(dateKey in dateIndex)){
            dateIndex[dateKey]=0
        } 
        dateIndex[dateKey]++

        let transaction = {
            created_at
            , account_no
            , transaction_type
            , payee
            , description
            , category
            , tags
            , subtotal_aud: subtotal_aud.replace('.', '')
            , currency
            , fee_aud: fee_aud.replace('.', '')
            , round_up: round_up.replace('.', '')
            , total_aud: total_aud.replace('.', '')
            , payment_method
            , settled_date
            , day_order:dateIndex[dateKey]
            , bank_id
        }

        transaction.category = transaction.category == '' ? null : transaction.category
        transaction.payment_method = transaction.payment_method == '' ? null : transaction.payment_method
        transactions.push(transaction)
    }
}

await sql.begin( async sql => {
    
    accounts = [...accounts]
    accounts = accounts.map(JSON.parse)

    {
        let chunk = Math.ceil(65000 / accounts.length * 4)

        for( let i = 0; true; i+= chunk ) {
            let subset =
                accounts.slice(i, i+chunk)
         
            if( !subset.length ) break;
            
            try {
                await sql`
                    insert into account ${ sql(subset, 'bank_id', 'account_no', 'account_name', 'account_holder') }
                    on conflict (bank_id, account_no) 
                    do update set 
                        account_name = coalesce(excluded.account_name, account.account_name)
                        ,
                        account_holder = coalesce(excluded.account_holder, account.account_holder)
                `
            } catch (e) {
                console.log(e)
                throw e
            }
        }
    }
    
    {

        let chunk = Math.ceil(65000 / transactions.length * 20)
        
        for( let i = 0; true; i+= chunk ) {
        
            let subset = transactions.slice(i, i + chunk)
            if( !subset.length ) break;
    
            await sql`
                insert into transaction ${
                    sql(
                        subset
                        , 'account_no'
                        , 'transaction_type'
                        , 'payee'
                        , 'description'
                        , 'category'
                        , 'created_at'
                        , 'tags'
                        , 'subtotal_aud'
                        , 'currency'
                        , 'fee_aud'
                        , 'round_up'
                        , 'total_aud'
                        , 'payment_method'
                        , 'settled_date'
                        , 'day_order'
                        , 'bank_id'
                    )
                }
                on conflict ( 
                    bank_id
                    , account_no
                    , created_on
                    , day_order 
                    , subtotal_aud
                    , description
                ) do nothing 
            `
        }
    }

    console.log('accounts', accounts.length)
    console.log('transactions', transactions.length)
})


await sql.end()