import leaflet from "leaflet";

export interface Cell {
    readonly i: number;
    readonly j: number;
}

export interface Cache {
    coins: Coin[];
    serialNumber: number;
    readonly location: Cell;
}

export class Coin {
    readonly spawnLocation: Cell;
    readonly serial: number;
    constructor(spawnLocation: Cell, serial: number) {
        this.spawnLocation = spawnLocation;
        this.serial = serial;
    }
}

export class Board {
    readonly tileWidth: number;
    readonly tileVisibilityRadius: number;

    private readonly knownCells: Map<string, Cell>;

    constructor(tileWidth: number, tileVisibilityRadius: number) {
        this.tileWidth = tileWidth;
        this.tileVisibilityRadius = tileVisibilityRadius;
        this.knownCells = new Map();
    }

    private getCanonicalCell(cell: Cell): Cell {
        const { i, j } = cell;
        const key = [i, j].toString();
        if (!this.knownCells.has(key)) {
            this.knownCells.set(key, { i, j });
        }
        return this.knownCells.get(key)!;
    }

    getCellForPoint(point: leaflet.LatLng): Cell {
        return this.getCanonicalCell({
            i: Math.floor(point.lat / this.tileWidth),
            j: Math.floor(point.lng / this.tileWidth),
        });
    }

    getCellBounds(cell: Cell): leaflet.LatLngBounds {
        const { i, j } = cell;
        return leaflet.latLngBounds(
            [i * this.tileWidth, j * this.tileWidth],
            [(i + 1) * this.tileWidth, (j + 1) * this.tileWidth]
        );
    }

    getCellsNearPoint(point: leaflet.LatLng): Cell[] {
        const resultCells: Cell[] = [];
        const originCell = this.getCellForPoint(point);
        for (
            let i = -this.tileVisibilityRadius;
            i <= this.tileVisibilityRadius;
            i++
        ) {
            for (
                let j = -this.tileVisibilityRadius;
                j <= this.tileVisibilityRadius;
                j++
            ) {
                resultCells.push(
                    this.getCanonicalCell({
                        i: originCell.i + i,
                        j: originCell.j + j,
                    })
                );
            }
        }
        return resultCells;
    }

    createNewCache(cell: Cell, numCoins: number): Cache {
        const newCache: Cache = {
            coins: [],
            serialNumber: 0,
            location: cell,
        };

        for (let i = 0; i < numCoins; i++) {
            newCache.coins.push(new Coin(cell, newCache.serialNumber++));
        }
        return newCache;
    }
}
