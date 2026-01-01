import { CONFIG, TYPES, ROOM_PROPS, beep } from './Engine.js';

class ElevatorCar {
    constructor(x, typeProps) {
        this.x = x;
        this.y = CONFIG.LOBBY_FLOOR;
        this.passengers = [];
        this.requests = new Set(); 
        this.direction = 0; // 0: Idle, 1: Up, -1: Down
        this.doorsOpen = false;
        this.doorTimer = 0;

        // New properties from ROOM_PROPS
        this.type = typeProps.elevatorType || 'STANDARD';
        this.speed = typeProps.speed || 0.2;
        this.capacity = typeProps.capacity || 8;

        // Zone definition [minFloor, maxFloor]
        this.zone = [0, CONFIG.GRID_H - 1];
    }

    // Agent calls this to request a pickup from a floor
    requestPickup(floor, direction) {
        if (this.canStopAt(floor)) {
            this.requests.add(floor);
        }
    }

    // Agent calls this when they get in the car
    addDestination(floor) {
        if (this.canStopAt(floor)) {
            this.requests.add(floor);
        }
    }

    canStopAt(floor) {
        return floor >= this.zone[0] && floor <= this.zone[1];
    }

    update(peopleList) {
        // 1. Door Logic
        if (this.doorsOpen) {
            this.doorTimer--;
            this.handlePassengers(peopleList); 
            if (this.doorTimer <= 0) {
                this.doorsOpen = false;
                this.decideDirection(); 
            }
            return;
        }

        // 2. Movement Logic
        if (this.direction === 0) {
            this.decideDirection();
        }

        if (this.direction !== 0) {
            const nextStop = this.findNextStop();

            if (nextStop === -1) {
                // No more stops in this direction, try switching
                this.direction *= -1;
                const nextStopAfterTurn = this.findNextStop();
                if (nextStopAfterTurn === -1) {
                    this.direction = 0; // No requests anywhere, idle.
                }
                return;
            }

            const dist = nextStop - this.y;
            const absDist = Math.abs(dist);
            
            if (absDist < this.speed) {
                // Arrived at nextStop
                this.y = nextStop;
                this.doorsOpen = true;
                this.doorTimer = 60; // Open doors for 1 second
                this.requests.delete(nextStop);
                // Also remove any passenger destinations for this floor
                this.passengers.forEach(p => {
                    if (Math.round(p.destinationY) === this.y) {
                        this.requests.delete(this.y);
                    }
                });
                beep(800, 50, 'sine');
            } else {
                // Move car
                this.y += Math.sign(dist) * this.speed;
            }
        }
    }

    findNextStop() {
        const destinations = Array.from(this.requests).sort((a,b) => a-b);
        const isFull = this.passengers.length >= this.capacity;

        // Destinations for passengers inside the car are always valid stops.
        const passengerDestinations = new Set(this.passengers.map(p => Math.round(p.destinationY)));

        if (this.direction === 1) { // Going Up
            return destinations.find(f => {
                if (f <= this.y) return false;
                // Stop if someone needs to get off OR if the car is not full (it's a pickup)
                return passengerDestinations.has(f) || !isFull;
            }) ?? -1;
        } else { // Going Down
            return destinations.reverse().find(f => {
                if (f >= this.y) return false;
                return passengerDestinations.has(f) || !isFull;
            }) ?? -1;
        }
    }

    decideDirection() {
        if (this.requests.size === 0) {
            this.direction = 0;
            return;
        }

        // If idle, go towards the nearest request
        if (this.direction === 0) {
            const floors = Array.from(this.requests);
            let closest = floors[0];
            let minDist = Math.abs(floors[0] - this.y);

            floors.forEach(f => {
                const d = Math.abs(f - this.y);
                if (d < minDist) {
                    minDist = d;
                    closest = f;
                }
            });
            this.direction = closest > this.y ? 1 : -1;
        }
        // Otherwise, keep current direction unless there are no more requests in that direction
    }

    handlePassengers(peopleList) {
        const currentFloor = Math.round(this.y);

        // 1. UNLOAD passengers whose destination is the current floor
        for (let i = this.passengers.length - 1; i >= 0; i--) {
            const p = this.passengers[i];
            if (Math.round(p.destinationY) === currentFloor) {
                p.elevator = null;
                p.x = this.x;
                p.y = this.y;
                p.visible = true;
                p.state = 'idle'; 
                p.decideNextMove(); 
                this.passengers.splice(i, 1);
            }
        }

        // 2. LOAD passengers waiting on this floor IF there is capacity
        if (this.passengers.length < this.capacity) {
            const waiting = peopleList.filter(p => 
                p.state === 'waiting_for_elev' &&
                Math.abs(p.x - this.x) < 1 &&
                Math.round(p.y) === currentFloor
            );

            waiting.forEach(p => {
                // Check if car is full and can take them to their destination
                if (this.passengers.length < this.capacity && this.canStopAt(Math.round(p.destinationY))) {
                    // If this is a service elevator, simulate staff-only by random chance
                    if (this.type === 'SERVICE' && Math.random() > 0.1) {
                        return; // Not staff, can't board
                    }

                    p.state = 'riding';
                    p.visible = false;
                    p.elevator = this;
                    this.passengers.push(p);
                    this.addDestination(Math.round(p.destinationY));
                }
            });
        }
    }
}

export class SystemsManager {
    constructor() {
        this.elevators = [];
    }

    syncElevators(grid) {
        const shaftData = new Map(); // Use a map to store props for each shaft
        for(let y=0; y<CONFIG.GRID_H; y++) {
            for(let x=0; x<CONFIG.GRID_W; x++) {
                const cell = grid[y][x];
                const isElevator = cell.type === TYPES.ELEVATOR || cell.type === TYPES.ELEVATOR_EXPRESS || cell.type === TYPES.ELEVATOR_SERVICE;
                if (isElevator) {
                    if (!shaftData.has(x)) {
                        shaftData.set(x, ROOM_PROPS[cell.type]);
                    }
                }
            }
        }

        // Create new elevators for new shafts
        shaftData.forEach((props, x) => {
            if (!this.elevators.find(e => e.x === x)) {
                this.elevators.push(new ElevatorCar(x, props));
            }
        });
        
        // Remove elevators for deleted shafts
        this.elevators = this.elevators.filter(e => shaftData.has(e.x));
    }

    update(peopleList) {
        this.elevators.forEach(e => e.update(peopleList));
    }

    draw(ctx) {
        const cs = CONFIG.CELL_SIZE;
        this.elevators.forEach(e => {
            const px = e.x * cs;
            const py = e.y * cs;
            
            // Car color based on type
            let carColor = '#B71C1C'; // Standard
            if (e.type === 'EXPRESS') carColor = '#0D47A1';
            if (e.type === 'SERVICE') carColor = '#F57F17';

            ctx.fillStyle = e.doorsOpen ? '#FFF' : carColor;
            ctx.fillRect(px + 2, py + 2, cs-4, cs-4);
            
            // Draw passenger count indicator
            if (e.passengers.length > 0) {
                ctx.fillStyle = e.passengers.length >= e.capacity ? '#FF0000' : '#00E676';
                const capacityRatio = Math.min(e.passengers.length / e.capacity, 1);
                ctx.fillRect(px + 3, py + (cs - 6), (cs - 6) * capacityRatio, 2);
            }
        });
    }
}
