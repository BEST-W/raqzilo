import {createRequire} from 'node:module';
import {mkdir} from 'node:fs/promises';
import {spawn} from 'node:child_process';
const require=createRequire(import.meta.url);
const {build}=require('esbuild');
await mkdir('.sites-runtime',{recursive:true});
await build({entryPoints:['scripts/local-pdf-check.mjs'],outfile:'.sites-runtime/local-pdf-check.mjs',platform:'node',format:'esm',target:'node22',bundle:true,packages:'external',logLevel:'error'});
const child=spawn(process.execPath,['.sites-runtime/local-pdf-check.mjs'],{stdio:'inherit'});
child.on('exit',(code,signal)=>{process.exitCode=code??1;});
