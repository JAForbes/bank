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
    const [account_name, bsb_no, account_no] = account_details.split('-')

    accounts.push({ account_no, bsb_no, account_name, account_holder, bank_id })

    let dateIndex = {}
    for (let row of rows){
        
        let [
            date,
            amount,
            description
        ] = row

        if (amount == null) continue;

        let dateKey = [date1.getDay(),date1.getMonth(),date1.getFullYear()].join('/')

        if(dateKey in dateIndex){
            dateIndex[dateKey]=0
        } 
        dateIndex[dateKey]++
        
        
        date = df.parse(`${date} ${TZ}`, 'dd/mm/yyyy XXX', new Date())

        amount = amount.replace('.', '') // cents
        
        let transaction = {
            created_at: date
            , account_no: `${bsb_no} ${account_no} ${account_name}` 
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

console.log({ accounts })
console.log(transactions[0])
process.exit(1)

for( let i = 0; i < Math.ceil(65000 / accounts.length * 4); i++ ) {
    let subset =
        accounts.slice(i, i+(65000 / db_rows.length * 4))
    
    await sql`
        insert into ${ sql(subset, 'account_no', 'bsb_no', 'account_name', 'account_holder') }
        on conflict (account_no, bsb_no)
        do update account_name = excluded.account_name
            account_holder = excluded.account_holder
    `
}

for( let i = 0; i < Math.ceil(65000 / transactions.length * 20); i++ ) {

    let subset = transactions.slice(i, i+(65000 / transactions.length * 20))
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
            )
        }
        on conflict (hash) do nothing 
    `
}

await sql.end()