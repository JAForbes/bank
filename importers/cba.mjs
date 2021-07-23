#!./node_modules/.bin/zx
import papa from 'papaparse'
import path from 'path'
import * as df from 'date-fns'
import postgres from 'postgres'

import dotenv from 'dotenv'
dotenv.config()

const TZ = process.env.TZ || '+10:00'

const sql = postgres(`${process.env.CLUSTER_URL}/${process.env.PGDATABASE}`, {
    max: 1
})

const [{bank_id}] = await sql`select bank_id from bank where name = 'CBA'`

const filenames = argv._.filter( x => x.endsWith('.csv') )
let transactions = []
let accounts = []
for( let filepath of filenames ) {
    
    const contents = (await fs.readFile(filepath)).toString('utf8') 
    const { data: rows } = papa.parse(contents, {
        dynamicTyping: false
    })

    const [account_details, account_holder] = path.parse(filepath).dir.split('/').reverse()
    let [account_name, bsb_no, account_no] = account_details.split('-')

    account_no = `${bsb_no} / ${account_no}`
    accounts.push({ account_no, account_name, account_holder, bank_id })

    let dateIndex = {}
    for (let row of rows){
        
        let [
            date,
            amount,
            description
        ] = row

        if (amount == null) continue;
               
        date = df.parse(`${date} ${TZ}`, 'dd/mm/yyyy XXX', new Date())

        let dateKey = [date.getDate(),date.getMonth(),date.getFullYear()].join('/')

        if(!(dateKey in dateIndex)){
            dateIndex[dateKey]=0
        } 
        dateIndex[dateKey]++

        amount = amount.replace('.', '') // cents
        
        let transaction = {
            created_at: date
            , account_no
            , transaction_type: null
            , payee: null
            , description
            , category: null
            , tags: ''
            , subtotal_aud: amount
            , currency: 'AUD'
            , fee_aud: 0
            , round_up: 0
            , total_aud: amount
            , payment_method: null
            , settled_date: date
            , day_order: dateIndex[dateKey]
            , bank_id
        }

        transactions.push(transaction)
    }
}

await sql.begin( async sql => {

    for( let i = 0; i < Math.ceil(65000 / accounts.length * 4); i++ ) {
        let subset =
            accounts.slice(i, i+65000 / accounts.length * 4)
     
        if( !subset.length ) break;
        console.log(subset.length)
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

        i = i+65000 / transactions.length * 20
    }
    
    for( let i = 0; i < Math.ceil(65000 / transactions.length * 20); i++ ) {
    
        let subset = transactions.slice(i, i+65000 / transactions.length * 20)

        if( !subset.length ) break;
        console.log(subset.length)
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

        i = i+65000 / transactions.length * 20
    }

    // throw new Error('Rollback')
})


await sql.end()