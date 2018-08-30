const http = require('http');
const net  = require('net');

// Setup Handler
const server = http.createServer(httpHandler);
server.addListener('connect', httpsHandler);
server.listen(8080);

function httpHandler(req, res) {
    const [domain, port] = getDomainAndPortFromUrl(req.url, 80);

     const options = {
         port: 80,
         method: req.method,
         headers: req.headers
     };

    const proxyRequest = http.request(domain, options, proxyRes => {
        proxyRes.on('data', chunk => res.write(chunk));
        proxyRes.on('end', () => res.end());
        proxyRes.on('error', err => {
            res.write("HTTP/" + req.httpVersion + " 500 Connection error\r\n\r\n");
            res.end();
        });

        res.writeHead(proxyRes.statusCode, proxyRes.headers);
    });

    req.on('data', chunk => proxyRequest.write(chunk));
    req.on('error', err => proxyRequest.end());
    req.on('end', () => proxyRequest.end());

    console.log('PROXY: ', domain, port)
}

function httpsHandler(req, res) {
    const [domain, port] = getDomainAndPortFromUrl(req.url, 80);
    const proxySocket = new net.Socket();

    console.log('PROXY: ', domain, port);

    proxySocket.connect(port, domain, () => {
        res.write("HTTP/" + req.httpVersion + " 200 Connection established\r\n\r\n");
    });

    proxySocket.on('data', chunk => res.write(chunk));
    proxySocket.on('end', () => res.end());
    proxySocket.on('error', err => {
        res.write("HTTP/" + req.httpVersion + " 500 Connection error\r\n\r\n");
        res.end();
    });

    res.on('data', chunk => proxySocket.write(chunk));
    res.on('end', () => proxySocket.end());
    res.on('error', () => proxySocket.end());
}

// Splits port number from url
function getDomainAndPortFromUrl(url, defaultPort) {
    const hostportRegex = /^([^:]+)(:([0-9]+))?$/;
    const splitted = hostportRegex.exec(url);

    const host = splitted != null ? splitted[1] : url;
    const port = splitted != null && splitted[2] != null ? splitted[3] : defaultPort;

    return [host, parseInt(port)];
}
