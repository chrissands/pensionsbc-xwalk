import { createServer } from 'node:http';

const PORT = 8787;
const SOURCE = 'https://college.pensionsbc.ca/leaving-your-job';

const SEARCH = {
  results: [{
    id: '1',
    data: {
      source: SOURCE,
      metadata: { title: 'Leaving your job', description: 'How leaving your job affects your pension.' },
    },
  }],
  cursor: null,
};

const ANSWER = {
  result: 'Leaving your job can change **how your pension is paid**.',
  hits: [{ id: '1', metadata: { title: 'Leaving your job', url: SOURCE } }],
};

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function send(res, status, body) {
  res.writeHead(status, { ...CORS, 'Content-Type': 'application/json' });
  res.end(body ? JSON.stringify(body) : undefined);
}

createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS);
    res.end();
    return;
  }
  let raw = '';
  req.on('data', (chunk) => { raw += chunk; });
  req.on('end', () => {
    console.log(req.method, req.url, raw);
    if (req.url === '/search') {
      send(res, 200, SEARCH);
    } else if (req.url === '/gensearch') {
      const { query } = JSON.parse(raw || '{}');
      if (query === 'fail') send(res, 500, { error: 'boom' });
      else send(res, 200, ANSWER);
    } else {
      send(res, 404, { error: 'not found' });
    }
  });
}).listen(PORT, () => console.log(`mock Content AI listening on ${PORT}`));
