export const name = 'No Accounts Hash'
export const description = `
    Instead of computing a hash during the import, just use a multi column unique constraint.

    It makes it clearer how "identity" is defined.
`

export async function transaction(sql){
    await sql`
        alter table transaction 
            drop column hash
            ,
            add constraint same_transaction unique (
                account_no
                , created_at
                , subtotal_aud
                , description
            )
        ;
    `
}