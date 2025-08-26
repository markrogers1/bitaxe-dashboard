let prevPrice = null;
let btcAddress = localStorage.getItem('btcAddress') || '';
let priceHistory = JSON.parse(localStorage.getItem('priceHistory')) || [];
let lastBlockTime = null;
let priceChart;

const priceCtx = document.getElementById('priceChart').getContext('2d');
priceChart = new Chart(priceCtx, {
    type: 'line',
    data: {
        labels: priceHistory.map(p => p.time),
        datasets: [{
            label: 'BTC Price (USD)',
            data: priceHistory.map(p => p.price),
            borderColor: '#00ff00',
            backgroundColor: 'rgba(0, 255, 0, 0.2)',
            fill: true,
            tension: 0.3
        }]
    },
    options: {
        scales: {
            y: { beginAtZero: false, grid: { color: 'rgba(255, 255, 255, 0.1)' } },
            x: { grid: { display: false } }
        },
        plugins: {
            legend: { display: false }
        }
    }
});

if (btcAddress) {
    document.getElementById('btc-address').value = btcAddress;
    fetchBitaxeStats();
}

function saveAddress() {
    btcAddress = document.getElementById('btc-address').value.trim();
    if (!isValidBtcAddress(btcAddress)) {
        alert('Invalid BTC address format');
        return;
    }
    localStorage.setItem('btcAddress', btcAddress);
    fetchBitaxeStats();
}

function isValidBtcAddress(address) {
    return /^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(address);
}

async function fetchWithRetry(url, retries = 3, delay = 1000) {
    for (let i = 0; i < retries; i++) {
        try {
            const res = await fetch(url);
            if (!res.ok) throw new Error(`HTTP error: ${res.status}`);
            return res;
        } catch (err) {
            if (i === retries - 1) {
                console.error(`Failed to fetch ${url}:`, err);
                return null;
            }
            await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, i)));
        }
    }
}

async function fetchBtcPrice() {
    const res = await fetchWithRetry('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd');
    if (!res) {
        const cached = localStorage.getItem('lastPrice');
        if (cached) document.getElementById('btc-price').textContent = `${cached} (cached)`;
        return;
    }
    const data = await res.json();
    const currentPrice = data.bitcoin.usd;
    const priceEl = document.getElementById('btc-price');
    priceEl.textContent = `$${currentPrice.toLocaleString()}`;
    localStorage.setItem('lastPrice', `$${currentPrice.toLocaleString()}`);

    if (prevPrice !== null) {
        priceEl.classList.remove('up', 'down');
        if (currentPrice > prevPrice) priceEl.classList.add('up');
        else if (currentPrice < prevPrice) priceEl.classList.add('down');
    }
    prevPrice = currentPrice;

    const time = new Date().toLocaleTimeString();
    priceHistory.push({ time, price: currentPrice });
    if (priceHistory.length > 10) priceHistory.shift();
    localStorage.setItem('priceHistory', JSON.stringify(priceHistory));
    priceChart.data.labels = priceHistory.map(p => p.time);
    priceChart.data.datasets[0].data = priceHistory.map(p => p.price);
    priceChart.update();
}

async function fetchBitaxeStats() {
    if (!btcAddress) return;
    const res = await fetchWithRetry(`https://solo.ckpool.org/users/${btcAddress}`);
    if (!res) {
        document.getElementById('hr1m').textContent = 'Unavailable';
        return;
    }
    const text = await res.text();
    try {
        const data = JSON.parse(`{${text}}`);
        document.getElementById('hr1m').textContent = data.hashrate1m || 'N/A';
        document.getElementById('hr5m').textContent = data.hashrate5m || 'N/A';
        document.getElementById('hr1h').textContent = data.hashrate1hr || 'N/A';
        document.getElementById('bestshare').textContent = data.bestshare || 'N/A';
        document.getElementById('lastshare').textContent = data.lastshare ? new Date(data.lastshare * 1000).toLocaleString() : 'N/A';
    } catch (err) {
        console.error('Parsing error:', err);
        document.getElementById('hr1m').textContent = 'Parse error';
    }
}

async function fetchLotteryData() {
    const blocksRes = await fetchWithRetry('https://mempool.space/api/blocks');
    if (blocksRes) {
        const blocks = await blocksRes.json();
        const lastBlock = blocks[0];
        lastBlockTime = lastBlock.timestamp * 1000;
        document.getElementById('last-height').textContent = lastBlock.height;
        updateTimer();
    }

    const mempoolRes = await fetchWithRetry('https://mempool.space/api/mempool');
    if (mempoolRes) {
        const mempool = await mempoolRes.json();
        document.getElementById('mempool-size').textContent = mempool.count.toLocaleString();
    }

    const feesRes = await fetchWithRetry('https://mempool.space/api/v1/fees/recommended');
    if (feesRes) {
        const fees = await feesRes.json();
        document.getElementById('high-fee').textContent = fees.fastestFee;
    }
}

function updateTimer() {
    if (!lastBlockTime) return;
    const elapsedMs = Date.now() - lastBlockTime;
    const elapsedMin = Math.floor(elapsedMs / 60000);
    const elapsedSec = Math.floor((elapsedMs % 60000) / 1000);
    const timerEl = document.getElementById('time-elapsed');
    timerEl.textContent = `${elapsedMin}m ${elapsedSec}s`;
    document.getElementById('next-estimate').textContent = `~${10 - elapsedMin}min remaining (avg)`;

    if (elapsedMin >= 8) {
        timerEl.parentElement.classList.add('near-block');
    } else {
        timerEl.parentElement.classList.remove('near-block');
    }
}

fetchBtcPrice();
fetchLotteryData();
fetchBitaxeStats();
setInterval(fetchBtcPrice, 30000);
setInterval(fetchBitaxeStats, 60000);
setInterval(fetchLotteryData, 30000);
setInterval(updateTimer, 1000);
