'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),publicDir=path.join(root,'public');
const walk=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(item=>{const full=path.join(dir,item.name);assert(!item.isSymbolicLink(),'Public directory must not contain symbolic links');return item.isDirectory()?walk(full):[full];});
const files=walk(publicDir),problems=[],references=new Set();
for(const name of ['index.html','.nojekyll','portal-config.js','portal-client.js','portal.js','portal.css','portal-fields.json','student.html','student.js','student.css','student-admin.js','app.js','studio.js','moodboard.js','assets/studio-pdf.js','assets/studio-pdf-LICENSES.txt','starter/index.html','worksheets/game-moodboard-template.pdf','worksheets/game-moodboard-template.pptx'])if(!fs.existsSync(path.join(publicDir,name)))problems.push('Missing public file: '+name);
function inspectReference(source,reference){
 if(!reference||reference.includes('${')||/^(?:#|https?:|data:|blob:|mailto:|tel:|javascript:)/i.test(reference))return;
 const clean=reference.split(/[?#]/,1)[0];if(!clean)return;
 if(clean.startsWith('/')){problems.push('Root-relative asset does not work at a GitHub project path: '+path.relative(publicDir,source)+' → '+reference);return;}
 let resolved;try{resolved=path.resolve(path.dirname(source),decodeURIComponent(clean));}catch{problems.push('Invalid asset URL in '+source);return;}
 if(resolved!==publicDir&&!resolved.startsWith(publicDir+path.sep)){problems.push('Asset escapes public directory: '+reference);return;}
 references.add(resolved);if(!fs.existsSync(resolved))problems.push('Missing asset: '+path.relative(publicDir,resolved)+' (from '+path.relative(publicDir,source)+')');
}
for(const file of files){
 const rel=path.relative(publicDir,file);if(/(?:^|[\\/])(?:\.env(?:\..*)?|.*\.(?:pem|key|p12|pfx)|.*(?:credentials|session|state)\.json)$/i.test(rel))problems.push('Private file must not be published: '+rel);
 if(!/\.(?:html|css|js|json)$/i.test(file))continue;const text=fs.readFileSync(file,'utf8');
 if(/sb_secret_|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(text))problems.push('Secret material found in public file: '+rel);
 for(const token of text.matchAll(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g)){try{if(JSON.parse(Buffer.from(token[0].split('.')[1],'base64url').toString()).role==='service_role')problems.push('Service-role key found in public file: '+rel);}catch{}}
 if(/\.(?:html|css)$/i.test(file)){
  for(const m of text.matchAll(/(?:src|href)\s*=\s*["']([^"']+)["']/g))inspectReference(file,m[1]);
  for(const m of text.matchAll(/url\(\s*["']?([^\s)'";]+)["']?\s*\)/g))inspectReference(file,m[1]);
 }
 if(/\.js$/i.test(file))for(const m of text.matchAll(/["'`](\.\/[A-Za-z0-9_./-]+\.(?:html|css|js|json|png|jpe?g|svg|webp|pdf|pptx)(?:\?[^"'`\s]*)?)["'`]/g))inspectReference(file,m[1]);
 if(/\.(?:html|js)$/i.test(file)&&/signin-with-chatgpt|["']\/api\/portal/.test(text))problems.push('Old hosting authentication/API URL remains: '+rel);
}
try{const schema=JSON.parse(fs.readFileSync(path.join(publicDir,'portal-fields.json'),'utf8'));assert.equal(schema.forms.plan.fields.length,8);assert.equal(schema.forms.log.fields.length,8);const achievement=schema.forms.log.fields.find(f=>f.key==='achievement');assert.equal(achievement.type,'checkboxes');assert.equal(achievement.options.length,5);}catch(e){problems.push('Portal form schema: '+e.message);}
if(problems.length){console.error(problems.join('\n'));process.exitCode=1;}else console.log('Static check passed: '+files.length+' public files, '+references.size+' local asset references, no private publish files.');
