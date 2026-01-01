import { CONFIG, TYPES } from './Engine.js';

class Person {
    constructor(targetX, targetY, isVisitor = false) {
        this.x = 0; 
        this.y = CONFIG.LOBBY_FLOOR;
        this.targetX = targetX;
        this.targetY = targetY; 
        this.realTargetY = targetY; 
        this.isVisitor = isVisitor;
        this.state = 'walking_to_transport'; 
        this.waitTimer = 0;
        this.elevator = null;
        this.targetElevatorX = 0;
        
        this.shirtColor = isVisitor ? '#e91e63' : `hsl(${200 + Math.random()*40}, 70%, 50%)`;
        this.skinColor = '#ffccaa';
        this.heightVar = Math.random() * 2;
    }

    findTransport(grid) {
        for (let tx = 0; tx < CONFIG.GRID_W; tx++) {
            if (grid[Math.floor(this.y)][tx].type === TYPES.ELEVATOR &&
                grid[Math.floor(this.targetY)][tx].type === TYPES.ELEVATOR) {
                this.targetElevatorX = tx;
                return 'elevator';
            }
        }
        for (let tx = 0; tx < CONFIG.GRID_W; tx++) {
            if (grid[Math.floor(this.y)][tx].type === TYPES.STAIRS &&
                grid[Math.floor(this.targetY)][tx].type === TYPES.STAIRS) {
                this.targetElevatorX = tx;
                return 'stairs';
            }
        }
        if (Math.floor(this.targetY) !== CONFIG.LOBBY_FLOOR) {
            for (let tx = 0; tx < CONFIG.GRID_W; tx++) {
                if (grid[Math.floor(this.y)][tx].type === TYPES.ELEVATOR &&
                    grid[CONFIG.LOBBY_FLOOR][tx].type === TYPES.ELEVATOR) {
                    this.targetElevatorX = tx;
                    this.targetY = CONFIG.LOBBY_FLOOR;
                    return 'elevator';
                }
            }
        }
        return null;
    }

    enterElevator(elevator) {
        this.state = 'riding';
        this.elevator = elevator;
    }

    exitElevator(x, y) {
        this.state = 'exiting';
        this.x = x;
        this.y = y;
        this.elevator = null;
    }

    update(dt, grid, elevators) {
        const speed = this.state === 'using_stairs' ? 0.03 : 0.12;

        if (this.state === 'walking_to_transport') {
            const transport = this.findTransport(grid);
            if (!transport) { this.state = 'leaving'; return false; }
            
            if (Math.abs(this.x - this.targetElevatorX) < 0.2) {
                this.x = this.targetElevatorX;
                this.state = transport === 'elevator' ? 'waiting' : 'using_stairs';
                if (this.state === 'waiting') {
                    const elev = elevators.find(e => e.x === this.targetElevatorX);
                    if (elev) elev.addRequest(Math.floor(this.y), this.targetY < this.y);
                }
            } else {
                this.x += Math.sign(this.targetElevatorX - this.x) * 0.1;
            }
        }
        else if (this.state === 'waiting') {
            this.waitTimer++;
            if (this.waitTimer > CONFIG.MAX_WAIT) this.state = 'leaving';
        }
        else if (this.state === 'riding') {
            if (this.elevator) {
                this.x = this.elevator.x;
                this.y = this.elevator.y;
            }
        }
        else if (this.state === 'using_stairs') {
            if (Math.abs(this.y - this.targetY) < 0.1) {
                this.y = this.targetY;
                this.state = 'exiting';
            } else {
                this.y += Math.sign(this.targetY - this.y) * speed * (dt/16);
            }
        }
        else if (this.state === 'exiting') {
            if (Math.abs(this.x - this.targetX) < 0.2) {
                if (Math.floor(this.y) === CONFIG.LOBBY_FLOOR && this.targetX === 0) {
                    return true; 
                }
                if (Math.floor(this.y) === CONFIG.LOBBY_FLOOR && Math.floor(this.realTargetY) !== CONFIG.LOBBY_FLOOR) {
                    this.targetY = this.realTargetY;
                    this.state = 'walking_to_transport';
                } else {
                    this.state = 'arrived';
                    const cell = grid[Math.floor(this.y)][Math.floor(this.targetX)];
                    if (cell && cell.occupants) cell.occupants.push(this);
                }
            } else {
                this.x += Math.sign(this.targetX - this.x) * 0.1;
            }
        }
        else if (this.state === 'leaving') {
            this.y += 0.2;
            if (this.y > CONFIG.GRID_H) return true;
        }

        return false;
    }
}

export class SimulationManager {
    constructor() {
        this.people = [];
        this.spawnFlags = { daily: false, hotel: false };
    }

    spawn(type, grid) {
        let spawned = 0;
        for (let y = 0; y < CONFIG.GRID_H; y++) {
            for (let x = 0; x < CONFIG.GRID_W; x++) {
                const cell = grid[y][x];
                // Spawn only on anchors to prevent duplicate spawns
                if (!cell.isAnchor || !cell.connected) continue;

                let shouldSpawn = false;
                if (type === 'OFFICE' && cell.type === TYPES.OFFICE && cell.occupants.length < 4) shouldSpawn = true;
                if (type === 'HOTEL' && cell.type === TYPES.HOTEL && cell.occupants.length < 3) shouldSpawn = true;

                if (shouldSpawn) {
                    this.people.push(new Person(x, y, cell.type === TYPES.HOTEL));
                    spawned++;
                }
            }
        }
        return spawned;
    }

    despawn(type, grid) {
         this.people.forEach(p => {
             if ((type === 'OFFICE' && !p.isVisitor) || (type === 'HOTEL' && p.isVisitor)) {
                 if (p.state === 'arrived') {
                     p.realTargetY = CONFIG.LOBBY_FLOOR;
                     p.targetY = CONFIG.LOBBY_FLOOR;
                     p.targetX = 0; 
                     p.state = 'walking_to_transport';
                     
                     const cell = grid[Math.floor(p.y)][Math.floor(p.targetX)];
                     if(cell && cell.occupants) cell.occupants = cell.occupants.filter(o => o !== p);
                 }
             }
        });
    }

    update(dt, speed, grid, elevators, time) {
        if (time >= 8 * 60 && !this.spawnFlags.daily) {
            this.spawn('OFFICE', grid);
            this.despawn('HOTEL', grid);
            this.spawnFlags.daily = true;
        }
        if (time >= 17 * 60 && !this.spawnFlags.hotel) {
            this.spawn('HOTEL', grid);
            this.despawn('OFFICE', grid);
            this.spawnFlags.hotel = true;
        }
        if (time < 8 * 60) {
            this.spawnFlags.daily = false;
            this.spawnFlags.hotel = false;
        }

        this.people = this.people.filter(p => !p.update(dt * speed, grid, elevators));
    }

    draw(ctx) {
        const time = Date.now();
        this.people.forEach(p => {
            const px = p.x * CONFIG.CELL_SIZE + CONFIG.CELL_SIZE / 2;
            const py = p.y * CONFIG.CELL_SIZE + CONFIG.CELL_SIZE / 2 + 5;

            ctx.save();
            ctx.translate(px, py);
            ctx.fillStyle = p.skinColor; ctx.fillRect(-2, -12 - p.heightVar, 4, 4);
            ctx.fillStyle = p.shirtColor; ctx.fillRect(-3, -8 - p.heightVar, 6, 6);
            ctx.fillStyle = '#222';
            let legOffset = 0;
            if (p.state !== 'waiting' && p.state !== 'arrived' && p.state !== 'riding') {
                if (Math.floor(time / 150) % 2 === 0) legOffset = 2; 
            }
            ctx.fillRect(-2, -2 - p.heightVar, 2, 3 + (legOffset ? 0 : 2));
            ctx.fillRect(1, -2 - p.heightVar, 2, 3 + (legOffset ? 2 : 0));
            ctx.restore();
        });
    }
}
