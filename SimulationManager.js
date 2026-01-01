import { CONFIG, TYPES } from './Engine.js';

class Person {
    constructor(startX, startY, type) {
        this.x = startX; 
        this.y = startY;
        this.type = type; 
        
        // Final Destination (e.g., The Office)
        this.destinationX = startX;
        this.destinationY = startY;
        
        // Immediate Waypoint (e.g., The Elevator)
        this.targetX = startX;
        this.targetY = startY; 
        
        this.color = this.getColorByType(type);
        this.state = 'idle'; // idle, walking, waiting, riding, exiting
        this.patience = CONFIG.MAX_WAIT || 1200; 
        this.visible = true;
        this.elevator = null;
        this.stress = 0;
    }

    getColorByType(type) {
        const colors = {
            'HOTEL': '#E91E63',
            'OFFICE': '#2196F3',
            'CONDO': '#FF9800',
            'VISITOR': '#4CAF50',
            'JANITOR': '#00BCD4'
        };
        return colors[type] || '#9E9E9E';
    }

    // Call this to set the final goal
    setGoal(x, y) {
        this.destinationX = x;
        this.destinationY = y;
        this.decideNextMove();
    }

    decideNextMove() {
        // 1. Are we on the correct floor?
        if (Math.abs(this.y - this.destinationY) > 0.1) {
            // No: We need to find an elevator
            this.state = 'needs_elevator';
        } else {
            // Yes: Walk to final destination X
            this.targetX = this.destinationX;
            this.targetY = this.destinationY; // Should match current Y
            
            if (Math.abs(this.x - this.destinationX) < 0.1) {
                // We are there!
                if (this.destinationX === 0 && this.destinationY === CONFIG.LOBBY_FLOOR) {
                     this.state = 'despawn'; // We left the building
                } else {
                     this.state = 'idle';
                }
            } else {
                this.state = 'walking';
            }
        }
    }

    update(dt, speed, grid, elevators) {
        // STATE: NEEDS ELEVATOR
        // We are on the wrong floor, looking for a path
        if (this.state === 'needs_elevator') {
            let bestElev = null;
            let minDist = Infinity;

            elevators.forEach(e => {
                // Simplified: Assume all elevators go everywhere for now
                const dist = Math.abs(e.x - this.x);
                if (dist < minDist) {
                    minDist = dist;
                    bestElev = e;
                }
            });

            if (bestElev) {
                this.targetX = bestElev.x;
                this.state = 'walking_to_elev';
            } else {
                // No elevator found (trapped)
                this.stress += 0.1 * speed;
            }
        }

        // STATE: WALKING (General or To Elevator)
        if (this.state === 'walking' || this.state === 'walking_to_elev') {
            const dx = this.targetX - this.x;
            if (Math.abs(dx) > 0.1) {
                const moveSpeed = 0.1 * speed; // Walking speed
                this.x += Math.sign(dx) * moveSpeed;
            } else {
                // Arrived at targetX
                this.x = this.targetX; // Snap
                
                if (this.state === 'walking_to_elev') {
                    this.state = 'waiting_for_elev';
                    // We need to request the elevator here
                    // Ideally found elevator instance, but for now we wait for system to pick us up
                } else {
                    this.decideNextMove(); // Re-evaluate (did we reach office? or just a waypoint?)
                }
            }
        }

        // STATE: WAITING
        else if (this.state === 'waiting_for_elev') {
            this.patience -= 1 * speed;
            if (this.patience < 0) this.stress += 0.05 * speed;
            
            // Logic to request elevator is handled in SimulationManager update loop or System
        }

        // STATE: RIDING
        else if (this.state === 'riding') {
            if (this.elevator) {
                this.x = this.elevator.x;
                this.y = this.elevator.y;
            }
        }

        // Return true if person should be removed (left building)
        return this.state === 'despawn';
    }
}

export class SimulationManager {
    constructor() {
        this.people = [];
    }

    spawn(count, type, grid) {
        for(let i=0; i<count; i++) {
            // Spawn at lobby entrance (x=0)
            const p = new Person(0, CONFIG.LOBBY_FLOOR, type);
            
            // Find Destination
            let dest = null;
            if (type === 'OFFICE') {
                const offices = [];
                for(let y=0; y<CONFIG.GRID_H; y++) {
                    for(let x=0; x<CONFIG.GRID_W; x++) {
                        if(grid[y][x].type === TYPES.OFFICE && grid[y][x].isAnchor) {
                            offices.push({x: x, y: y});
                        }
                    }
                }
                if (offices.length > 0) dest = offices[Math.floor(Math.random() * offices.length)];
            }

            if (dest) {
                p.setGoal(dest.x, dest.y);
                this.people.push(p);
            }
        }
    }

    update(dt, speed, grid, elevators, timeOfDay) {
        // 1. Spawning Logic
        // Morning Rush (7am - 9am)
        if (timeOfDay > 7 * 60 && timeOfDay < 10 * 60) {
            if (Math.random() < 0.02 * speed) this.spawn(1, 'OFFICE', grid);
        }

        // Evening Exit (5pm - 7pm)
        if (timeOfDay > 17 * 60 && timeOfDay < 19 * 60) {
            this.people.forEach(p => {
                // If in office and idle, go home
                if (p.type === 'OFFICE' && p.state === 'idle' && Math.abs(p.y - CONFIG.LOBBY_FLOOR) > 1) {
                    p.setGoal(0, CONFIG.LOBBY_FLOOR);
                }
            });
        }

        // 2. Elevator Request Logic (Bridge between Sim and System)
        this.people.forEach(p => {
            if (p.state === 'waiting_for_elev') {
                // Find elevator at this X and add request
                const elev = elevators.find(e => Math.abs(e.x - p.x) < 1);
                if (elev) elev.addRequest(Math.floor(p.y));
            }
        });

        // 3. Update Agents
        this.people = this.people.filter(p => !p.update(dt, speed, grid, elevators));
    }

    draw(ctx) {
        const cs = CONFIG.CELL_SIZE;
        this.people.forEach(p => {
            if (!p.visible) return;
            const px = p.x * cs + cs/2;
            const py = p.y * cs + cs - 2;

            ctx.fillStyle = p.color;
            ctx.fillRect(px - 3, py - 12, 6, 12);
            
            // Draw stress
            if (p.stress > 50) {
                ctx.fillStyle = 'red';
                ctx.fillRect(px - 2, py - 16, 4, 2);
            }
        });
    }

    getTotalPopulation() {
        return this.people.length;
    }
}
