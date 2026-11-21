import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { hash, randomToken } from './src/worker.mjs';

const privateDir = new URL('.local/',import.meta.url);
await mkdir(privateDir,{recursive:true});
if (process.argv[2]==='storage-key') {
  const path=new URL('cloud-storage-key.txt',privateDir);
  try { await writeFile(path,randomToken(),{flag:'wx',mode:0o600}); }
  catch (error) { if(error.code!=='EEXIST') throw error; }
  const key=(await readFile(path,'utf8')).trim();
  if(!/^[0-9a-f]{64}$/.test(key)) throw new Error('Invalid stored encryption key');
  process.stdout.write(key+'\n');
} else if (process.argv[2]==='invites') {
  const count=Number(process.argv[3]||5);
  const expires=Date.parse(process.argv[4]||'');
  if(!Number.isInteger(count) || count<1 || count>10 || !Number.isFinite(expires) || expires<=Date.now()) {
    throw new Error('Usage: node prepare-cloud.mjs invites 5 <ISO8601 expiry>');
  }
  const inserts=[];
  const codes=[];
  for(let i=0;i<count;i++) {
    const invite=randomToken();
    const key=await hash(invite);
    inserts.push("INSERT INTO accounts(id,invite_hash,expires) VALUES('"+crypto.randomUUID()+"','"+key+"',"+expires+");");
    codes.push(invite);
  }
  await writeFile(new URL('cloud-invites.txt',privateDir),codes.join('\n')+'\n',{flag:'wx',mode:0o600});
  await writeFile(new URL('cloud-invites.sql',privateDir),inserts.join('\n')+'\n',{flag:'wx'});
  console.log('Created '+count+' invitation records. Each invite is a sign-in credential.');
} else if (process.argv[2]==='preview-invite') {
  const data=JSON.parse(await readFile(new URL('demo.json',privateDir),'utf8'));
  await writeFile(new URL('本机体验凭证.txt',privateDir),data.invite+'\n',{mode:0o600});
} else {
  throw new Error('Unknown operation');
}
