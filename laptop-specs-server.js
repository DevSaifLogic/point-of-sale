const http = require('http');
const fs = require('fs');
const path = require('path');

// Set the port to match your Python script
const PORT = 8080;
const DATA_DIR = path.join(__dirname, 'database');
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}
const FILE_PATH = path.join(DATA_DIR, 'laptops.json');

const server = http.createServer((req, res) => {
    // Only accept POST requests containing the system data
    if (req.method === 'POST') {
        let body = '';

        // Collect the incoming data chunks
        req.on('data', chunk => {
            body += chunk.toString();
        });

        // Once all data is received
        req.on('end', () => {
            try {
                // Validate that the incoming data is valid JSON
                const parsedData = JSON.parse(body);

                // Read existing file content or initialize an empty array if file doesn't exist
                let existingData = [];
                if (fs.existsSync(FILE_PATH)) {
                    const fileContent = fs.readFileSync(FILE_PATH, 'utf8');
                    if (fileContent.trim()) {
                        existingData = JSON.parse(fileContent);
                        if (!Array.isArray(existingData)) {
                            existingData = [existingData];
                        }
                    }
                }

                // Add the new record to the list
                existingData.push(parsedData);

                // Write the updated array back to the file with clean formatting
                fs.writeFileSync(FILE_PATH, JSON.stringify(existingData, null, 4), 'utf8');
                
                console.log(`[${new Date().toISOString()}] Successfully saved specifications for: ${parsedData.Model || 'Unknown Device'}`);

                // Send success response to the client script
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ status: 'success', message: 'Data logged successfully' }));

            } catch (error) {
                console.error('Error processing request:', error.message);
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ status: 'error', message: 'Invalid JSON payload' }));
            }
        });
    } else {
        // Handle non-POST requests gracefully
        res.writeHead(405, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'error', message: 'Method Not Allowed' }));
    }
});

// Start listening for connections
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running and listening on port ${PORT}`);
    console.log(`Data will be appended to: ${FILE_PATH}`);
});