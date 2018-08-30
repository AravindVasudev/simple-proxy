const http = require('http');
const net  = require('net');

const cache = new Map();

// Setup Handler
const server = http.createServer(httpHandler);
server.on('connect', httpsHandler);
server.listen(8080);

function httpHandler(req, res) {
    // Unique Id for request
    const urlId = constructRequestIdentifier(req.url, req.method, req.headers);
    const [domain, port] = getDomainAndPortFromUrl(req.url, 80);

    // if cached, respond from cache
    if (cache.has(urlId)) {
        console.log('CACHE (HTTP): ', domain, port);

        const cachedResponse = cache.get(urlId);

        res.writeHead(cachedResponse.status, cachedResponse.headers);
        res.end(cachedResponse.response);

        return;
    }

    // Send HTTP request using original request and cache it
    let tempResponseStore = []; // stores response for caching
    req.headers['Accept-Encoding'] = 'gzip'; // enables to accept gzip response
    const options = {
         port: 80,
         method: req.method,
         headers: req.headers
     };

    const proxyRequest = http.request(domain, options, proxyResponse => {
        proxyResponse.on('data', chunk => {
            tempResponseStore.push(chunk);
            res.write(chunk);
        });

        proxyResponse.on('end', () => {
            cache.set(urlId, {
                status: proxyResponse.statusCode,
                headers: proxyResponse.headers,
                response: Buffer.concat(tempResponseStore).toString('base64')
            });
            
            res.end();
        });

        proxyResponse.on('error', err => {
            res.write("HTTP/" + req.httpVersion + " 500 Connection error\r\n\r\n");
            res.end();
        });

        res.writeHead(proxyResponse.statusCode, proxyResponse.headers);
    });

    req.on('data', chunk => proxyRequest.write(chunk));
    req.on('error', err => proxyRequest.end());
    req.on('end', () => proxyRequest.end());

    console.log('PROXY (HTTP): ', domain, port);
}

function httpsHandler(req, res) {
    // Unique Id for request
    const urlId = constructRequestIdentifier(req.url, req.method, req.headers);
    const [domain, port] = getDomainAndPortFromUrl(req.url, 80);

    // if cached, respond from cache
    if (cache.has(urlId)) {
        console.log('CACHE (HTTPS): ', domain, port);
        res.end(cache.get(urlId).response);

        return;
    }

    // Connect user's request to server using a socket
    const proxySocket = new net.Socket();
    let response = [];

    proxySocket.connect(port, domain, () => {
        res.write("HTTP/" + req.httpVersion + " 200 Connection established\r\n\r\n");
    });

    proxySocket.on('data', chunk => {
        response.push(chunk);
        res.write(chunk);
    });

    proxySocket.on('end', () => {
        cache.set(urlId, Buffer.concat(response).toString('base64'));
        res.end();
    });

    proxySocket.on('error', err => {
        res.write("HTTP/" + req.httpVersion + " 500 Connection error\r\n\r\n");
        res.end();
    });

    res.on('data', chunk => proxySocket.write(chunk));
    res.on('end', () => proxySocket.end());
    res.on('error', () => proxySocket.end());

    console.log('PROXY (HTTPS): ', domain, port);
}

// Splits port number from url
function getDomainAndPortFromUrl(url, defaultPort) {
    const hostportRegex = /^([^:]+)(:([0-9]+))?$/;
    const splitted = hostportRegex.exec(url);

    const host = splitted != null ? splitted[1] : url;
    const port = splitted != null && splitted[2] != null ? splitted[3] : defaultPort;

    return [host, parseInt(port)];
}

// Creates unique identifier for a request
function constructRequestIdentifier(url, method, header) {
    return url + method + header;
}
