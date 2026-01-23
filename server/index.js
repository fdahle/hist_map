// base code to start the server
const express = require("express"); // import express
const path = require('path'); // to handle file paths
const cors = require('cors'); // to handle CORS issues
const app = express(); // create an Express app
const PORT = 3000;

    // Define who is allowed to call the server
const corsOptions = {
  origin: [
    'http://localhost:8080', // Vue (standard)
    'http://localhost:5173', // Vue (Vite)
    ],
  methods: ['GET', 'POST'], // Only allow specific actions
};

// serve input folder as well
app.use(cors(corsOptions));
app.use('/input', express.static(path.join(__dirname, '../input')));

// Start the Server
app.listen(PORT, () => {
    console.log(`------------------------------------------------`);
    console.log(`Server is running!`);
    console.log(`Open your map here: http://localhost:${PORT}`);
    console.log(`------------------------------------------------`);
});