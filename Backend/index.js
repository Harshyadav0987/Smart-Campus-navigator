const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors({
  origin: [
    "http://localhost:5173",
    "https://smart-campus-navigator-frontend1.onrender.com"
  ]
}))
app.use(express.json());

// routes
app.use('/api/nodes', require('./routes/Node'));
app.use('/api/edges', require('./routes/Edge'));

// connect to mongodb and start server
mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log('MongoDB connected');
    app.listen(process.env.PORT, () => {
      console.log(`Server running on port ${process.env.PORT}`);
    });
  })
  .catch(err => console.log(err));