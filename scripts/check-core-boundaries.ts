import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

const files=await readdir('src/core')
for(const name of files){
	if(!name.endsWith('.ts'))continue
	const path=join('src/core',name)
	const source=await readFile(path,'utf8')
	if(/(?:from|import)\s*[(]?\s*['"](?:solid-js|react|vue|svelte|@solidjs\/)/.test(source))throw new Error(`${path} imports a UI framework`)
}
console.info(`Framework boundary checked across ${files.filter(name=>name.endsWith('.ts')).length} core modules`)
