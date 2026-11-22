import re,sys
core=open('api/_score.js').read().replace('export ','')
app=open('src/app.html').read().replace('/*CORE*/',core)
open('index.html','w').write(app.replace('<!--SRV-->','<meta name="srv" content="1">'))
open('/home/claude/out/simple-demo.html','w').write(app.replace('<!--SRV-->',''))
print('built')
