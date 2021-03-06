export const name = 'Accounts'
export const description = `
    Basic accounts representation (optional)
`

export async function transaction(sql){
    await sql`
        create table account(
            account_id uuid primary key default public.gen_random_uuid()
            , account_no text not null
            , account_name text null
            , account_holder text null
            , created_at timestamptz not null default now()
            , constraint unique_account UNIQUE (bank_id, account_no)
        );
    `
}