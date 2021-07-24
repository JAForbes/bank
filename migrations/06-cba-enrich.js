export const name = 'CBA Enrich'
export const description = `
    We want all our data to be as closed to the Up CSV as possible, it is the baseline.

    The CBA CSV does not come with a lot of columns but the description is fairly structured.

    We aim to parse it within pgpsql functions and enrich the data where possible.
`

export async function always(sql){
    await sql.raw`
        select 1
    `
}