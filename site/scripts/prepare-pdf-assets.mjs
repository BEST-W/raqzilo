import { mkdir,copyFile,readdir } from 'node:fs/promises';
import {createRequire} from 'node:module';
import path from 'node:path';
await mkdir('public/vendor/mupdf',{recursive:true});
for(const name of ['mupdf.js','mupdf-wasm.js','mupdf-wasm.wasm'])await copyFile('node_modules/mupdf/dist/'+name,'public/vendor/mupdf/'+name);
const require=createRequire(import.meta.url),tesseractRoot=path.dirname(require.resolve('tesseract.js/package.json'));
const coreRoot=path.dirname(createRequire(path.join(tesseractRoot,'package.json')).resolve('tesseract.js-core/package.json'));
await mkdir('public/vendor/ocr/core',{recursive:true});
await mkdir('public/vendor/ocr/lang',{recursive:true});
for(const name of ['tesseract.esm.min.js','worker.min.js'])await copyFile(path.join(tesseractRoot,'dist',name),'public/vendor/ocr/'+name);
for(const name of await readdir(coreRoot))if(/^tesseract-core.*\.wasm(?:\.js)?$/.test(name))await copyFile(path.join(coreRoot,name),'public/vendor/ocr/core/'+name);
for(const lang of ['ara','eng']){
 const root=path.dirname(require.resolve('@tesseract.js-data/'+lang+'/package.json'));
 await copyFile(path.join(root,'4.0.0_best_int',lang+'.traineddata.gz'),'public/vendor/ocr/lang/'+lang+'.traineddata.gz');
}
await copyFile(path.join(tesseractRoot,'LICENSE.md'),'public/licenses/Tesseract-Apache-2.0.txt');
console.log('Self-hosted PDF and Arabic/English OCR assets ready.');
