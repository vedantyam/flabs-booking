require('dotenv').config();
const express = require('express');
const cors = require('cors');

const slotsRouter = require('./routes/slots');
const bookingsRouter = require('./routes/bookings');
const supportPersonsRouter = require('./routes/supportPersons');
const woDaysRouter = require('./routes/woDays');
const adminRouter = require('./routes/admin');

const app = express();

app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true,
}));

app.use(express.json());

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.use('/api/slots', slotsRouter);
app.use('/api/bookings', bookingsRouter);
app.use('/api/book', bookingsRouter); // alias for POST /api/book
app.use('/api/support-persons', supportPersonsRouter);
app.use('/api/wo-days', woDaysRouter);
app.use('/api/admin', adminRouter);

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

const PORT = process.env.PORT || 3001;
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`FLABS Booking backend running on port ${PORT}`);
  });
}

module.exports = app;
