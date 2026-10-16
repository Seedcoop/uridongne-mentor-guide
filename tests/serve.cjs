'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.pdf':'application/pdf','.pptx':'application/vnd.openxmlformats-officedocument.presentationml.presentation','.txt':'text/plain; charset=utf-8'};
function createServer({directory=path.resolve(__dirname,'../public'),basePath='/uridongne-mentor-guide/'}={}){
 const root=path.resolve(directory);if(!basePath.startsWith('/')||!basePath.endsWith('/'))throw new Error('basePath must start and end with /');
 return http.createServer((request,response)=>{
  let pathname;try{pathname=decodeURIComponent(new URL(request.url,'http://localhost').pathname);}catch{response.writeHead(400).end();return;}
  if(!['GET','HEAD'].includes(request.method)){response.writeHead(405).end();return;}
  if(pathname===basePath.slice(0,-1)){response.writeHead(302,{Location:basePath}).end();return;}
  if(!pathname.startsWith(basePath)){response.writeHead(404).end('Not found');return;}
  const rel=pathname.slice(basePath.length)||'index.html',file=path.resolve(root,rel);
  if(file!==root&&!file.startsWith(root+path.sep)){response.writeHead(403).end();return;}
  fs.stat(file,(error,stat)=>{if(error||!stat.isFile()){response.writeHead(404).end('Not found');return;}response.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});if(request.method==='HEAD')response.end();else fs.createReadStream(file).pipe(response);});
 });
}
module.exports={createServer};
if(require.main===module){const port=Number(process.env.PORT)||8803;createServer().listen(port,'127.0.0.1',()=>console.log('Preview: http://127.0.0.1:'+port+'/uridongne-mentor-guide/'));}
