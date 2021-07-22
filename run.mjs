import dotenv from 'dotenv'
await dirs()
dotenv.config()
async function dirs(){
    await $`mkdir -p data/input output/zip output/unzip`
}

export async function fetchBankData(){
    const DATA_REPO = process.env.DATA_REPO
    const GH_TOKEN = process.env.GH_TOKEN
    if( DATA_REPO ) {
        await $`rm -fr output/unzip/**`
        await $`curl -H "Authorization: token ${GH_TOKEN}" -L https://api.github.com/repos/${DATA_REPO}/zipball > output/zip/data.zip`
        
        await $`unzip output/zip/data.zip -d output/unzip`
        await $`cp -r output/unzip/*/* data/input/`
    }
}

export async function migrations(){
    await $`psql ${process.env.CLUSTER_URL}/postgres -c "create database bank;"`.catch( () => {})
    await $`npx pgmg ${process.env.CLUSTER_URL}/${process.env.PGDATABASE} ./migrations/*`
}

export async function importers(){
    let xs = [
        // { importer: './importers/up.mjs', filepaths: (await nothrow($`find data/input/Up/*/*.csv`)).stdout.trim().split('\n') },
        // { importer: './importers/tmb.mjs', filepaths: (await nothrow($`find data/input/TMB/*/*/*.CSV`)).stdout.trim().split('\n') },
        { importer: './importers/cba.mjs', filepaths: (await nothrow($`find data/input/CBA/*/*/*.csv`)).stdout.trim().split('\n') }
    ]

    $.verbose = true
    for( let { importer, filepaths } of xs ) {
        try {
            await $`npx zx ${importer} ${filepaths.join(' ')}`
        } catch (e) {
            console.error('Could not import via', importer, e)
        }
    }
}