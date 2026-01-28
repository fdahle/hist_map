// base code to start the server
import express from "express"; // import express
import path from "path"; // to handle file paths
import cors from "cors"; // to handle CORS issues

import { fileURLToPath } from "url"; // Required to mimic __dirname in ES Modules

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
app.use('/data', express.static(path.join(__dirname, 'data')));

// Start the Server
app.listen(PORT, () => {
    console.log(`------------------------------------------------`);
    console.log(`Server is running!`);
    console.log(`Open your map here: http://localhost:${PORT}`);
    console.log(`------------------------------------------------`);
});