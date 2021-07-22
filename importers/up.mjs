#!./node_modules/.bin/zx
import papa from 'papaparse'
import postgres from 'postgres'

import dotenv from 'dotenv'
dotenv.config()

const filenames = argv._.filter( x => x.endsWith('.csv') )

const sql = postgres(`${process.env.CLUSTER_URL}/${process.env.PGDATABASE}`, {
    max: 1
})

const [{bank_id}] = await sql`select bank_id from bank where name = 'Up'`

let transactions = []
let accounts = []

for( let filepath of filenames ) {
    
    const contents = (await fs.readFile(filepath)).toString('utf8')

    const { data: rows } = papa.parse(contents, {
        dynamicTyping: false,
        header: true
    })

    // For up, we assume accounts are segretated files because the upname is not in the csv file
    // just the account no, and having the upname is great
    if( rows.length){
        const [account_name] = path.parse(filepath).dir.split('/').reverse()
        const account_holder = account_name
        const account_no = rows[0]['BSB / Account Number']
        accounts.push({ account_no, bsb_no, account_name, account_holder, bank_id })
    }

    let dateIndex = {}
    for (let row of rows){
        if (row['Total (AUD)'] == null) continue;

        let dateKey = [date1.getDay(),date1.getMonth(),date1.getFullYear()].join('/')

        if(dateKey in dateIndex){
            dateIndex[dateKey]=0
        } 
        dateIndex[dateKey]++

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
            , bank_id
            , day_order
        }

        transaction.category = transaction.category == '' ? null : transaction.category
        transaction.payment_method = transaction.payment_method == '' ? null : transaction.payment_method
        transactions.push(transaction)
    }
}

for( let i = 0; i < Math.ceil(65000 / transactions.length * 20); i++ ) {

    
    await sql`
        insert into transaction ${
            sql(
                transactions.slice(i, i+(65000 / transactions.length * 20))
                , 'hash'
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
        on conflict (hash) do nothing 
    `
}


await sql.end()