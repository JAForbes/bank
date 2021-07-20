#!./node_modules/.bin/zx
import papa from 'papaparse'
import * as df from 'date-fns'
import crypto from 'crypto'
import postgres from 'postgres'

import dotenv from 'dotenv'
dotenv.config()

const filenames = argv._.join(' ').split(' ').filter( x => x.endsWith('.csv') )

let db_rows = []
for( let filepath of filenames ) {
    console.log(filepath)
    const contents = (await fs.readFile(filepath)).toString('utf8')
    const { data: rows } = papa.parse(contents, {
        dynamicTyping: false,
        header: true
    })

    for (let row of rows){
        // let [
        //     date1,
        //     date2,
        //     description,
        //     blank,
        //     amount,
        //     balance,
        // ] = row

        // date1 = df.parse(`${date1} +10:00`, 'dd MMM yyyy XXX', new Date())
        // date2 = df.parse(`${date2} +10:00`, 'dd MMM yyyy XXX', new Date())

        // row = {date1, date2, description, blank, amount, balance}

        // if (row.amount == null) continue;
        // {
        //     Time: '2021-01-02T05:28:17+11:00',
        //     'BSB / Account Number': '633-123 / 165807751',
        //     'Transaction Type': 'International Purchase',
        //     Payee: 'Patreon',
        //     Description: 'Patreon* Membership1, INTERNET',
        //     Category: 'Gifts & Charity',
        //     Tags: '',
        //     'Subtotal (AUD)': '-7.17',
        //     Currency: 'USD',
        //     'Subtotal (Transaction Currency)': '-5.5',
        //     'Fee (AUD)': '0.00',
        //     'Round Up (AUD)': '0.00',
        //     'Total (AUD)': '-7.17',
        //     'Payment Method': '',
        //     'Settled Date': '2021-01-03'
        //   }
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

        let db_row = {
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
        }

        // something that is unlikely to change later, and unlikely to collide
        db_row.hash = 
            crypto.createHash('md5')
                .update(
                    JSON.stringify([created_at,account_no,payee,currency,subtotal_aud])
                )
                .digest('hex')
            

        db_row.category = db_row.category == '' ? null : db_row.category
        db_row.payment_method = db_row.payment_method == '' ? null : db_row.payment_method
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