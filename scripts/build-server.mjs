import ts from 'typescript';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
mkdirSync('server/domain',{recursive:true});
for(const name of ['store','vendors','product-label']){const source=readFileSync(`lib/${name}.ts`,'utf8').replaceAll("from './store'","from './store.mjs'");writeFileSync(`server/domain/${name}.mjs`,ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText);}
console.log('Backend domain built.');
