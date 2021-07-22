#!./node_modules/.bin/zx
import papa from 'papaparse'
import path from 'path'
import crypto from 'crypto'
import * as df from 'date-fns'
import postgres from 'postgres'

import dotenv from 'dotenv'
dotenv.config()

const TZ = process.env.TZ || '+10:00'

const filenames = argv._.filter( x => x.endsWith('.CSV') )

const sql = postgres(`${process.env.CLUSTER_URL}/${process.env.PGDATABASE}`, {
    max: 1
})

const [{bank_id}] = await sql`select bank_id from bank where name = 'TMB'`

let transactions = []
let accounts = []

for( let filepath of filenames ) {
    const contents = (await fs.readFile(filepath)).toString('utf8')
    const { data: rows } = papa.parse(contents, {
        dynamicTyping: false
    })

    const [account_name, account_no] = path.parse(filepath).dir.split('/').reverse()
    
    const account_holder = account_name
    let bsb_no = '812170'
    accounts.push({ account_no, bsb_no, account_name, account_holder, bank_id })

    let dateIndex = {}
    for (let row of rows){
        let [
            date1,
            date2,
            description,
            blank,
            amount,
            balance,
        ] = row

        date1 = df.parse(`${date1} ${TZ}`, 'dd MMM yyyy XXX', new Date())
        date2 = date2 ? df.parse(`${date2} ${TZ}`, 'dd MMM yyyy XXX', new Date()) : date1
        
        if (!amount) continue;

        let dateKey = [date1.getDay(),date1.getMonth(),date1.getFullYear()].join('/')

        if(dateKey in dateIndex){
            dateIndex[dateKey]=0
        } 
        dateIndex[dateKey]++
        
        amount = amount.replace('.', '') // cents
        row = {date1, date2, description, blank, amount, balance}
        const hashContent = JSON.stringify([account_no, account_name, date1, description, amount])
        
        let transaction = {
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
            , day_order: dateIndex[dateKey]
            , bank_id
        }
        
        // something that is unlikely to change later, and unlikely to collide
        transaction.hash = crypto.createHash('md5')
            .update(hashContent)
            .digest('hex')
        transactions.push(transaction)
    }
}

for( let i = 0; i < Math.ceil(65000 / transactions.length * 20); i++ ) {

    
    await sql`
        insert into transaction ${
            sql(
                transactions.slice(i, i+(65000 / transactions.length * 20))
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