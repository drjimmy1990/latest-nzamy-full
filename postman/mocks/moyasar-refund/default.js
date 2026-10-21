const http = require('http');
const server = http.createServer((req, res) => {
  const path = new URL(req.url, 'http://localhost').pathname;
  const match = /^\/v1\/payments\/(pay_[a-z_]+)(\/refund)?$/.exec(path);
  if (!match) { res.writeHead(501); return res.end('Call not covered by refund contract'); }
  const id = match[1];
  res.setHeader('Content-Type','application/json');
  if (req.method === 'POST' && id === 'pay_outage') { res.writeHead(500); return res.end(JSON.stringify({ type:'http_error', message:'Fixture outage' })); }
  if (req.method === 'POST' && id === 'pay_reject') { res.writeHead(400); return res.end(JSON.stringify({ type:'validation_error', message:'Fixture rejection' })); }
  const reversed = req.method === 'POST';
  res.end(JSON.stringify({ id, status:reversed ? 'refunded':'paid', amount:11500,
    currency: reversed && id === 'pay_wrong_currency' ? 'USD':'SAR',
    metadata:{ order_id:'order_fixture' }, source:{ type:'creditcard' },
    refunded:reversed ? 11500:0, captured:11500 }));
});
server.listen(process.env.PORT || 4920);
