import fs from "fs";
import os from "os";
import path from "path";
import csv from "csvtojson";
import puppeteer from "puppeteer";

const DEFAULT_TIMEOUT_MS = 15000;
const POLLING_INTERVAL_MS = 500;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const normalizeTrendItem = (item) => ({
    trend: item["Trends"],
    volume: item["Search volume"],
    breakdown: item["Trend breakdown"],
    started: item["Started"],
    ended: item["Ended"],
});

const buildGoogleTrendsUrl = ({ geo, status, sort, category, hours }) => {
    const params = new URLSearchParams({
        geo,
        status,
        sort,
        category,
        hours: String(hours),
    });

    return `https://trends.google.com/trending?${params.toString()}`;
};

const waitForDownloadedCsv = async ({ downloadsFolder, filesBefore, timeoutMs }) => {
    const start = Date.now();

    while (Date.now() - start < timeoutMs) {
        const currentFiles = new Set(fs.readdirSync(downloadsFolder));
        const newFiles = [...currentFiles].filter(
            (fileName) => !filesBefore.has(fileName) && fileName.endsWith(".csv")
        );

        if (newFiles.length > 0) {
            return newFiles[0];
        }

        await sleep(POLLING_INTERVAL_MS);
    }

    return null;
};

export function createGoogleTrendsScraperService({ cleanup = () => { } } = {}) {
    const scrape = async ({
        geo = "US",
        status = "active",
        sort = "search-volume",
        category = "all",
        hours = 24,
        timeoutMs = DEFAULT_TIMEOUT_MS,
    } = {}) => {
        const downloadsFolder = fs.mkdtempSync(
            path.join(os.tmpdir(), `google_trends_${Date.now()}_`)
        );

        let browser;
        let downloadedFilePath;

        try {
            const url = buildGoogleTrendsUrl({
                geo,
                status,
                sort,
                category,
                hours,
            });

            browser = await puppeteer.launch({
                args: ["--no-sandbox", "--disable-setuid-sandbox"],
            });

            const page = await browser.newPage();

            await page.setExtraHTTPHeaders({
                "Accept-Language": "en-US,en;q=0.9",
            });

            await page.setViewport({
                width: 1920,
                height: 1080,
            });

            const client = await page.createCDPSession();

            await client.send("Page.setDownloadBehavior", {
                behavior: "allow",
                downloadPath: downloadsFolder,
            });

            const filesBefore = new Set(fs.readdirSync(downloadsFolder));

            try {
                await page.goto(url, {
                    waitUntil: "networkidle2",
                    timeout: 30000,
                });

                await page.waitForSelector("tr[role='row']", {
                    timeout: 5000,
                });

                await sleep(1000);

                await page.waitForSelector('li[data-action="csv"]', {
                    timeout: 5000,
                });

                await page.evaluate(() => {
                    document.querySelector('li[data-action="csv"]').click();
                });
            } catch {
                const error = new Error(
                    "Cannot fetch trends data. Please check the parameters."
                );
                error.statusCode = 404;
                throw error;
            }

            const downloadedFile = await waitForDownloadedCsv({
                downloadsFolder,
                filesBefore,
                timeoutMs,
            });

            if (!downloadedFile) {
                const error = new Error("Download failed or timed out");
                error.statusCode = 500;
                throw error;
            }

            downloadedFilePath = path.join(downloadsFolder, downloadedFile);

            const jsonArray = await csv().fromFile(downloadedFilePath);

            return jsonArray.map(normalizeTrendItem);
        } finally {
            if (downloadedFilePath && fs.existsSync(downloadedFilePath)) {
                fs.unlinkSync(downloadedFilePath);
            }

            if (browser) {
                await browser.close();
            }

            cleanup(downloadsFolder);
        }
    };

    return {
        scrape,
    };
}