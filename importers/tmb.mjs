#!./node_modules/.bin/zx
import papa from 'papaparse'
import path from 'path'
import crypto from 'crypto'
import * as df from 'date-fns'
import postgres from 'postgres'

import dotenv from 'dotenv'
dotenv.config()

const filenames = argv._.join(' ').split(' ').filter( x => x.endsWith('.CSV') )

let db_rows = []
for( let filepath of filenames ) {
    const contents = (await fs.readFile(filepath)).toString('utf8')
    const { data: rows } = papa.parse(contents, {
        dynamicTyping: false
    })

    const [account_name, account_no] = path.parse(filepath).dir.split('/').reverse()
    console.log({ account_name, account_no })
    // continue;

    for (let row of rows){
        let [
            date1,
            date2,
            description,
            blank,
            amount,
            balance,
        ] = row

        date1 = df.parse(`${date1} +10:00`, 'dd MMM yyyy XXX', new Date())
        date2 = date2 ? df.parse(`${date2} +10:00`, 'dd MMM yyyy XXX', new Date()) : date1

        if (!amount) continue;
        
        amount = amount.replace('.', '') // cents
        row = {date1, date2, description, blank, amount, balance}
        const hashContent = JSON.stringify([account_no, account_name, date1, description, amount])
        
        let db_row = {
            created_at: date1
            , account_no: `${account_no}${account_name}` 
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
            , settled_date: date2
            
        }

        
        // something that is unlikely to change later, and unlikely to collide
        db_row.hash = crypto.createHash('md5')
            .update(hashContent)
            .digest('hex')
        db_rows.push(db_row)
    }
}

const sql = postgres(`${process.env.CLUSTER_URL}/${process.env.PGDATABASE}`, {
    max: 1
})

for( let i = 0; i < Math.ceil(65000 / db_rows.length * 20); i++ ) {

    
    await sql`
        insert into transaction ${
            sql(
                db_rows.slice(i, i+(65000 / db_rows.length * 20))
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
            )
        }
        on conflict (hash) do nothing 
    `
}


await sql.end()