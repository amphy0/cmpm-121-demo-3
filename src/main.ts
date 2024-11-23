// @deno-types="npm:@types/leaflet@^1.9.14"
import leaflet from "leaflet";

// Style sheets
import "leaflet/dist/leaflet.css";
import "./style.css";

// Fix missing marker images
import "./leafletWorkaround.ts";

import { Board, Cell, Coin } from "./board.ts";

// Deterministic random number generator
import luck from "./luck.ts";

// Location of our classroom (as identified on Google Maps)
const OAKES_CLASSROOM = leaflet.latLng(36.9894, -122.0627);

const GAMEPLAY_ZOOM_LEVEL = 19;
const TILE_DEGREES = 1e-4;
const NEIGHBORHOOD_SIZE = 8;
const CACHE_SPAWN_PROBABILITY = 0.1;

const board = new Board(TILE_DEGREES, NEIGHBORHOOD_SIZE);

const playerWallet: Coin[] = [];

// Memento pattern: cache state tracking
const cacheStates: Map<string, Coin[]> = new Map();
const activeCacheRects: Map<string, leaflet.Rectangle> = new Map();

// UI
const app = document.getElementById("app")!;
const gameName = "Geocoin Carrier";
document.title = gameName;
const header = document.createElement("h1");
header.innerHTML = gameName;
app.append(header);

const controlPanel = document.createElement("div");
app.appendChild(controlPanel);

const mapPanel = document.createElement("div");
app.appendChild(mapPanel);
mapPanel.id = "map";

const statusPanel = document.createElement("div");
app.appendChild(statusPanel);
statusPanel.innerHTML = `Player has ${playerWallet.length} coins.`;

const movePanel = document.createElement("div");
movePanel.innerHTML = `
<button id="move-up">⬆️</button>
<button id="move-left">⬅️</button>
<button id="move-down">⬇️</button>
<button id="move-right">➡️</button>
`;
controlPanel.appendChild(movePanel);

const map = leaflet.map(mapPanel, {
    center: OAKES_CLASSROOM,
    zoom: GAMEPLAY_ZOOM_LEVEL,
    minZoom: GAMEPLAY_ZOOM_LEVEL,
    maxZoom: GAMEPLAY_ZOOM_LEVEL,
    zoomControl: false,
    scrollWheelZoom: false,
});

leaflet
    .tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution:
            '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    })
    .addTo(map);

// Add a marker to represent the player
const playerMarker = leaflet.marker(OAKES_CLASSROOM);
playerMarker.bindTooltip("That's you!");
playerMarker.addTo(map);

function movePlayer(deltaLat: number, deltaLng: number) {
    const playerLat = playerMarker.getLatLng().lat + deltaLat;
    const playerLng = playerMarker.getLatLng().lng + deltaLng;
    const location = leaflet.latLng(playerLat, playerLng);
    playerMarker.setLatLng(location);
    populateMap();
}

// Attach button event listeners
document
    .getElementById("move-up")!
    .addEventListener("click", () => movePlayer(TILE_DEGREES, 0));
document
    .getElementById("move-down")!
    .addEventListener("click", () => movePlayer(-TILE_DEGREES, 0));
document
    .getElementById("move-left")!
    .addEventListener("click", () => movePlayer(0, -TILE_DEGREES));
document
    .getElementById("move-right")!
    .addEventListener("click", () => movePlayer(0, TILE_DEGREES));

function populateMap() {
    const location = playerMarker.getLatLng();
    const visibleCells = new Set<string>();

    for (const neighbor of board.getCellsNearPoint(location)) {
        const cellKey = cellToString(neighbor);
        visibleCells.add(cellKey);

        if (
            !cacheStates.has(cellKey) &&
            cellLuck(neighbor) < CACHE_SPAWN_PROBABILITY
        ) {
            spawnCache(neighbor);
        } else if (cacheStates.has(cellKey) && !activeCacheRects.has(cellKey)) {
            restoreCache(neighbor);
        }
    }

    // Remove caches that are no longer in range
    for (const [cellKey, rect] of activeCacheRects) {
        if (!visibleCells.has(cellKey)) {
            rect.remove();
            activeCacheRects.delete(cellKey);
        }
    }
}

function spawnCache(cellToSpawn: Cell) {
    const bounds = board.getCellBounds(cellToSpawn);
    const pointValue = Math.floor(cellLuck(cellToSpawn) * 100);
    const cache = board.createNewCache(cellToSpawn, pointValue);

    cacheStates.set(cellToString(cellToSpawn), [...cache.coins]);

    const rect = leaflet.rectangle(bounds);
    rect.addTo(map);
    activeCacheRects.set(cellToString(cellToSpawn), rect);

    rect.bindPopup(() => createPopupContent(cache, cellToSpawn));
}

function restoreCache(cell: Cell) {
    const savedCoins = cacheStates.get(cellToString(cell))!;
    const bounds = board.getCellBounds(cell);
    const cache = {
        location: cell,
        coins: [...savedCoins],
        serialNumber: savedCoins.length,
    };

    const rect = leaflet.rectangle(bounds);
    rect.addTo(map);
    activeCacheRects.set(cellToString(cell), rect);

    rect.bindPopup(() => createPopupContent(cache, cell));
}

function createPopupContent(cache: Cache, cell: Cell): HTMLElement {
    const popupDiv = document.createElement("div");
    popupDiv.innerHTML = `
<div>There is a cache here at "${cellToString(cell)}". 
There are <span id="value">${cache.coins.length}</span> coins here.</div>
<button id="collect">Collect</button>
<button id="deposit">Deposit</button>`;

    popupDiv
        .querySelector<HTMLButtonElement>("#collect")!
        .addEventListener("click", () => {
            if (cache.coins.length > 0) {
                const coin = cache.coins.pop()!;
                popupDiv.querySelector<HTMLSpanElement>("#value")!.innerText =
                    cache.coins.length.toString();
                playerWallet.push(coin);
                statusPanel.innerHTML = `Collected coin: ${serializeCoin(coin)}`;
                cacheStates.set(cellToString(cell), [...cache.coins]); // Save updated state
            }
        });

    popupDiv
        .querySelector<HTMLButtonElement>("#deposit")!
        .addEventListener("click", () => {
            if (playerWallet.length > 0) {
                const coin = playerWallet.pop()!;
                cache.coins.push(coin);
                popupDiv.querySelector<HTMLSpanElement>("#value")!.innerText =
                    cache.coins.length.toString();
                statusPanel.innerHTML = `Deposited coin: ${serializeCoin(coin)}`;
                cacheStates.set(cellToString(cell), [...cache.coins]);
            }
        });

    return popupDiv;
}

function serializeCoin(coin: Coin): string {
    return `${coin.spawnLocation.i}:${coin.spawnLocation.j}#${coin.serial}`;
}

function cellToString(cell: Cell): string {
    const { i, j } = cell;
    return `${i}:${j}`;
}

function cellLuck(cell: Cell): number {
    return luck(cellToString(cell));
}

populateMap();
