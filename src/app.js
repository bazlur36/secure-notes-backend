const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const { corsOrigins } = require('./config/env');
const routes = require('./routes');
const { notFound, errorHandler } = require('./middleware/errorHandler');

const app = express();

app.set('trust proxy', 1); // Render/Vercel sit behind a proxy (needed for correct rate-limit IPs)
app.disable('x-powered-by');
app.use(helmet());
app.use(
  cors({
    origin(origin, cb) {
      // allow non-browser clients (curl/Postman) which send no Origin header
      if (!origin || corsOrigins.includes(origin)) return cb(null, true);
      return cb(null, false);
    },
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);
app.use(express.json({ limit: '100kb' }));

app.get('/', (_req, res) => res.json({ name: 'Secure Notes API', docs: 'See README.md', health: '/api/health' }));
app.use('/api', routes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
