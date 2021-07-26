/* eslint-disable max-depth */
import * as df from 'date-fns'
const TZ = process.env.TZ || '+10:00'

export const name = 'CBA Enrich'
export const description = `
    We want all our data to be as closed to the Up CSV as possible, it is the baseline.

    The CBA CSV does not come with a lot of columns but the description is fairly structured.

    We aim to parse it within pgpsql functions and enrich the data where possible.
`

export async function always(sql){
    const [{ bank_id }] = await sql`select bank_id from bank`

    const transactions = await sql`
        select distinct description, *
        from transaction
        where bank_id = ${bank_id}
        and description not like 'Direct Credit%'
        and description not like 'Direct Debit%'
        and description not like 'Transfer to xx%'
        and description not like 'Transfer to CBA A/c%'
        and description not like 'Transfer to%'
        and description not like '%AU Card xx%'
        and description not like '%US Card xx%'
        and description not like '%CA Card xx%'
        and description not like '%GB Card xx%'
        and description not like '%IE Card xx%'
        and description not like '%Fee Value Date%'
        and description not like '%CREDIT TO ACCOUNT'
        and description not like 'Transfer From%'
        and description not like 'Transfer from%'
        and description not like 'Transfer To%'
        and description <> 'Transaction Fee'
        and description <> 'Credit Interest'
        and description <> 'Bonus Interest'
        and description not like '% BPAY %'
        and description not like 'Chq Dep Branch %'
        -- and description like '%PayID%'
        order by description
    `

    let knownAppTypes = [
        'CommBank app'
        ,'CommBank App'
        ,'NetBank'
    ]

    let knownAppSequences = 
        [ 'PayID Phone'
        , 'PayID Email' 
        , ...knownAppTypes
        ]
        .flatMap(
            a => knownAppTypes.map( b => 
                `${a} from ${b}`    
            )
        )

    // direct credit
    for( let x of transactions ) {
        let { description } = x

        if (description == 'Credit Interest' || description == 'Bonus Interest') {
            let subtotal_native = x.subtotal_aud
            console.log({
                country: 'AUD'
                , payee: 'CBA'
                , description
                , subtotal_native
                , transaction_type: 'Interest'
                , currency: 'AUD'
            })
        } else if (description == 'Transaction Fee') {
            let subtotal_native = x.subtotal_aud
            console.log({
                country: 'AUD'
                , payee: 'CBA'
                , description
                , subtotal_native
                , transaction_type: 'Fee'
                , currency: 'AUD'
            })
        } else if (description.startsWith('Chq Dep Branch ')) {
            console.log({
                country: 'AUD'
                , payee: 'CBA'
                , branch: description.slice('Chq Dep Branch '.length)
                , transaction_type: 'Cheque Deposit'
                , currency: 'AUD'
            })
        } else if( description.startsWith('Direct Credit ') ) {
            description = description.substring('Direct Credit '.length)
            let id = description.substring(0,6)
            description = description.substring(id.length+1)
            let firstSpace = description.indexOf(' ')
            let payee = description.slice(0, firstSpace)
            let reference = description.slice(payee.length + 1)
            console.log(x.description,'->',{ id, payee, reference })
        } else if( description.startsWith('Direct Debit ') ) {
            description = description.substring('Direct Debit '.length)
            let id = description.substring(0,6)
            description = description.substring(id.length+1)
            let firstSpace = description.indexOf(' ')
            let payee = description.slice(0, firstSpace)
            let reference = description.slice(payee.length + 1)
            console.log(x.description,'->',{ id, payee, reference })
        } else if ( description.startsWith('Transfer to other Bank ') ) {
            description = description.substring('Transfer to other Bank '.length)
            let transaction_type = 'External Transfer'
            let appType = knownAppTypes.find( x => description.startsWith(x) )
            description = description.substring(appType.length+1)
            let userReference = description
            console.log({ transaction_type, appType, userReference })
        } else if ( description.startsWith('Transfer to CBA A/c ') ) {
            description = description.substring('Transfer to CBA A/c '.length)
            let firstSpace = description.indexOf(' ')
            let app = description.substring(0, firstSpace)
            description = description.substring(app.length+1)
            firstSpace = description.indexOf(' ')
            let payee = description.substring(0, firstSpace)
            description = description.substring(payee.length+1)
            let transaction_type = 'Internal Transfer'
            let userReference = description
            console.log({ app, payee, transaction_type, userReference })
        } else if ( description.startsWith('Transfer to xx') ) {
            description = description.substring('Transfer to '.length)
            let card_no = description.substring(0, 6)
            description = description.substring(card_no.length+1)
            let firstSpace = description.indexOf(' ')
            let app = description.substring(0, firstSpace)
            description = description.substring(app.length+1)
            let userReference = description
            let transaction_type = 'Internal Transfer'
            console.log({ card_no, app, userReference, transaction_type })
        } else if ( description.includes(' AU Card xx') ) {
            let transaction_type = 'Domestic Charge'
            let cardIndex = description.indexOf(' AU Card xx')
            let payee = description.substring(0, cardIndex)
            description = description.substring(cardIndex + 'AU Card xx6158 Value Date: '.length+1)
            const created_at = df.parse(`${description} ${TZ}`, 'dd/mm/yyyy XXX', new Date())
            
            console.log({ payee, created_at, transaction_type })
        } else if ( description.includes(' US Card xx') ) {
            let transaction_type = 'Domestic Charge'
            let cardIndex = description.indexOf(' Card xx')
            let prefix = description.slice(0, cardIndex)
            // let payee = description.substring(0, cardIndex)
            // description = description.substring(cardIndex + 'AU Card xx6158 Value Date: '.length+1)
            // const date = df.parse(`${description} ${TZ}`, 'dd/mm/yyyy XXX', new Date())
            let [region, country] = prefix.slice(-5).split(' ')
            let payee = description.slice(0, cardIndex-6)
            description = description.slice(cardIndex+6)
            let card_no = description.slice(0,6)
            description = description.slice(7)
            let subtotal_native = description.slice(4)
            let valueIndex = subtotal_native.indexOf('Value Date:')
            subtotal_native = subtotal_native.slice(0, valueIndex-1)
            subtotal_native = subtotal_native.replace('.', '')
            let created_at = df.parse(`${description.slice(valueIndex+16)} ${TZ}`, 'dd/mm/yyyy XXX', new Date())

            console.log({ 
                payee
                , region
                , country
                , card_no
                , description
                , transaction_type
                , currency: 'USD'
                , subtotal_native
                , created_at
            })
        } else if ( description.includes('CA Card xx') ) {
            let transaction_type = 'Domestic Charge'
            let cardIndex = description.indexOf(' Card xx')
            let prefix = description.slice(0, cardIndex)
            // let payee = description.substring(0, cardIndex)
            // description = description.substring(cardIndex + 'AU Card xx6158 Value Date: '.length+1)
            // const date = df.parse(`${description} ${TZ}`, 'dd/mm/yyyy XXX', new Date())
            let [region, country] = prefix.slice(-5).split(' ')
            let payee = description.slice(0, cardIndex-6)
            description = description.slice(cardIndex+6)
            let card_no = description.slice(0,6)
            description = description.slice(7)
            let subtotal_native = description.slice(4)
            let valueIndex = subtotal_native.indexOf('Value Date:')
            subtotal_native = subtotal_native.slice(0, valueIndex-1)
            subtotal_native = subtotal_native.replace('.', '')
            let created_at = df.parse(`${description.slice(valueIndex+16)} ${TZ}`, 'dd/mm/yyyy XXX', new Date())

            console.log({
                payee
                , region
                , country
                , card_no
                , description
                , transaction_type
                , currency: 'CAD'
                , subtotal_native
                , created_at
            })
        } else if ( description.includes('GB Card xx') ) {
            let transaction_type = 'Domestic Charge'
            let cardIndex = description.indexOf(' Card xx')
            let prefix = description.slice(0, cardIndex)
            // let payee = description.substring(0, cardIndex)
            // description = description.substring(cardIndex + 'AU Card xx6158 Value Date: '.length+1)
            // const date = df.parse(`${description} ${TZ}`, 'dd/mm/yyyy XXX', new Date())
            let [region, country] = prefix.slice(-5).split(' ')
            let payee = description.slice(0, cardIndex-6)
            description = description.slice(cardIndex+6)
            let card_no = description.slice(0,6)
            description = description.slice(7)
            let subtotal_native = description.slice(4)
            let valueIndex = subtotal_native.indexOf('Value Date:')
            subtotal_native = subtotal_native.slice(0, valueIndex-1)
            subtotal_native = subtotal_native.replace('.', '')
            let created_at = df.parse(`${description.slice(valueIndex+16)} ${TZ}`, 'dd/mm/yyyy XXX', new Date())

            console.log({
                payee
                , region
                , country
                , card_no
                , description
                , transaction_type
                , currency: 'GB'
                , subtotal_native
                , created_at
            })
        }  else if ( description.includes('IE Card xx') ) {
            console.log(description, x)
            let transaction_type = 'International Charge'
            let cardIndex = description.indexOf(' Card xx')
            let prefix = description.slice(0, cardIndex)
            // let payee = description.substring(0, cardIndex)
            // description = description.substring(cardIndex + 'AU Card xx6158 Value Date: '.length+1)
            // const date = df.parse(`${description} ${TZ}`, 'dd/mm/yyyy XXX', new Date())
            let [region, country] = prefix.split(' ').slice(-2)
            let payee = description.slice(0, cardIndex-3)
            description = description.slice(cardIndex+6)
            let card_no = description.slice(0,6)
            description = description.slice(7)
            let [currency, subtotal_native] = description.split(' ')
            subtotal_native = subtotal_native.replace('.', '')
            
            let valueIndex = description.indexOf('Value Date:')
            
            let created_at = df.parse(`${description.slice(valueIndex+'Value Date: '.length)} ${TZ}`, 'dd/mm/yyyy XXX', new Date())

            console.log({
                payee
                , country
                , region
                , card_no
                , description
                , transaction_type
                , currency
                , subtotal_native
                , created_at
            })
        } else if ( description.includes(' Fee Value Date:') ) {

            let valueIndex = description.indexOf('Value Date:')
            let date = description.slice(valueIndex + 'Value Date: '.length)
            let created_at = df.parse(`${date} ${TZ}`, 'dd/mm/yyyy XXX', new Date())
            let currency = 'AUD'
            let transaction_type = 'Fee'
            let payee = 'CBA'
            let subtotal_native = x.subtotal_aud
            description = description.slice(0, valueIndex)

            console.log({
                country: 'AUD'
                , payee
                , description
                , subtotal_native
                , transaction_type
                , currency
                , created_at
            })
        } else if (description.endsWith('CREDIT TO ACCOUNT')) {
            let transaction_type = 'Credit to Account'
            
            let endIndex = description.indexOf(' CREDIT TO ACCOUNT')
            let payee = description.slice('Transfer From '.length, endIndex)
            
            let subtotal_native = x.subtotal_aud
            console.log({ 
                transaction_type
                , payee
                , country: 'AUD'
                , currency: 'AUD'
                , subtotal_native 
            })
        } else if (description.startsWith('Transfer From ') ) {

            description = description.slice('Transfer From '.length)
            let subtotal_native = x.subtotal_aud
            
            let payee = []
            for( let x of description.split(' ') ){
                if( !x.match(/^[A-Z]+$/g) ) break;
                payee.push(x)
            }
            payee=payee.join(' ')
            
            description = description.slice(payee.length+1)

            console.log({ 
                transaction_type: 'Transfer'
                , payee
                , description
                , country: 'AUD'
                , currency: 'AUD'
                , subtotal_native
            })
        } else if (description.startsWith('Transfer from ') ) {
            let match = description.match(/xx\d{4}/)
            let hasCard = !!match
            let transaction_type = 'Transfer'
            description = description.slice('Transfer from '.length)
            let card_no = hasCard ? description.slice(0, 'xxXXXX'.length) : ''
            
            let app =
                hasCard ? description.slice(card_no.length+1) : description

            for( let knownAppType of knownAppTypes ) {
                if( app.startsWith(knownAppType) ) {
                    app = knownAppType
                    break;
                }
            }
            
            description = description.slice(
                (hasCard ? card_no.length + 1: 0)
                + app.length + 1
            )
            console.log({ description, card_no, app, transaction_type })
        } else if (description.startsWith('Transfer To')) {
            console.log('TF', description)
            let transaction_type = 'Transfer'
            let method='Transfer', app, payee;
            description = description.slice('Transfer To '.length)
            for( let sequence of knownAppSequences ) {
                let i = description.indexOf(sequence)
                if ( i > -1 ) {
                    [method,app] = sequence.split(' from ')
                    payee = description.slice(0, i-1)
                    description = description.slice(i+sequence.length+1)
                    break;
                }
            }

            if ( !app ) {
                for( let knownAppType of knownAppTypes ) {
                    let i = description.indexOf(knownAppType)
                    if ( i > -1 ) {
                        app = knownAppType
                        payee = description.slice(0, i-1)
                        description = description.slice(i+knownAppType.length+1)
                        break;
                    }
                }   
            }
            console.log({ transaction_type, description, payee, app, method })
        } else if (description.includes(' BPAY ')) {
            let transaction_type = 'BPAY'
            let method = transaction_type
            let app, payee
            let bpayRef
            let bpayBiller
            

            for(let sequence of knownAppTypes.map( x => ` ${x} BPAY `)) {
                let i = description.indexOf(sequence)
                if ( i > -1 ) {
                    app = sequence.slice(1, -(' BPAY').length-1)
                    
                    payee = description.slice(0, i)
                    description = description.slice(i+sequence.length)
                    
                    let spaceIndex = description.indexOf(' ')
                    bpayBiller = description.slice(0, spaceIndex)
                    description = description.slice(bpayBiller.length+1)
                    spaceIndex = description.indexOf(' ')
                    bpayRef = description.slice(0, spaceIndex)
                    description = description.slice(bpayRef.length+1)
                    break;
                }
            }
            console.log('bpay', { description, payee, app, transaction_type, method, bpayRef, bpayBiller })
        } else {
            console.log('else', description)
        }
        
    }

    // console.log(transactions)
}