mapboxgl.accessToken = 'pk.eyJ1IjoidmFzaWxlIiwiYSI6ImNsOXJqbjFrbDBxbTUzbnRmajM1YndoazUifQ.VhyfedsGCaW5WmrfL-Dg0A';

const map = new mapboxgl.Map({
    container: 'map',
    style: 'https://vectortiles.geo.admin.ch/styles/ch.swisstopo.leichte-basiskarte.vt/style.json',
    center: [9.760132, 46.596219],
    zoom: 16,
    maxZoom: 18,
    // hash: true,
    maxBounds: [9.54, 46.52, 9.97, 46.70],
});

class ShapeAnimator {
    constructor(map) {
        this.queryParams = new URLSearchParams(document.location.search);

        this.map = map;
        this.layerSourceId = 'vehicle-shape';
        this.animationTick = 50;
        this.mapJumpLocations = {
            preda: {
                distance: 7900,
                center: [9.776783, 46.588706],
                zoom: 15,
            },
            bergun: {
                distance: 17000,
                center: [9.75236, 46.62495],
                zoom: 14.6,
            },
            filisur: {
                distance: 30000,
                center: [9.67942, 46.67645],
                zoom: 14.2,
            },
        };
        
        this.currentDistance = null;
        
        this.speedFactor = 5.0;
        this.trackSpeed = 80;
        
        this.trackLength = null;
        this.incrementPosition = 1;
        
        this.pointsData = [];
        this.vehiclesData = {
            capricorn: {
                units: [20, 18, 18, 20],
                spaces: [1, 1, 1]
            },
        }
        
        let cars_no = 100;
        const custom_cars_no = this.queryParams.get('cars_no');
        if (custom_cars_no) {
            cars_no = custom_cars_no;

            const carsNoSpan = document.getElementById('carriages_no');
            carsNoSpan.textContent = cars_no;
            
            const customCarsContainer = document.getElementById('custom_cars_container');
            customCarsContainer.classList.remove('d-none');
        }
        const units_no = Math.round(cars_no / 4);

        this.vehiclesData['capricorn_world_record'] = this.addSpecialVehicle(units_no, 5, this.vehiclesData['capricorn']);

        this.mapVehiclesCoordsData = {};

        this.addControls();
        this.addLayers();

        this.dataLoadPromise = new Promise((resolve, reject) => {
            const resourceURLs = [
                './data/shape.geojson',
                './data/shape_points.geojson',
            ];

            const loadPromises = [];
            resourceURLs.forEach(resourceURL => {
                const loadPromise = fetch(resourceURL);
                loadPromises.push(loadPromise);
            });
            Promise.all(loadPromises).then(responses =>
                Promise.all(responses.map(response => response.json()))
            ).then(data_responses => {
                resolve(data_responses);
            });
        });
    }

    addEvents() {
        const speedMultiplySelect = document.getElementById('speed_multiply');
        speedMultiplySelect.addEventListener('change', ev => {
            this.speedFactor = parseFloat(speedMultiplySelect.value);
            this.computeIncrementPosition();
        })

        const jumpLocationSelect = document.getElementById('jump_location');
        jumpLocationSelect.addEventListener('change', ev => {
            const locationData = this.mapJumpLocations[jumpLocationSelect.value];
            
            this.currentDistance = locationData.distance;
            this.map.setCenter(locationData.center);
            this.map.setZoom(locationData.zoom);
        })

        const mapViewSelect = document.getElementById('map_view_select');
        mapViewSelect.addEventListener('change', ev => {
            if (mapViewSelect.value === '2d') {
                map.setPitch(0, {duration: 2000});
                map.setBearing(0);
            } else {
                map.setPitch(45, {duration: 2000});
            }
        })

        const carsNoSelect = document.getElementById('cars_no_select');
        carsNoSelect.addEventListener('change', ev => {
            const url = 'https://vasile.github.io/rhb-100/?cars_no=' + carsNoSelect.value;
            window.location = url;
        });
    }

    addSpecialVehicle(unitsCount, spaceVehicle, srcVehicleData) {
        const longVehicleData = {
            units: [],
            spaces: [],
        }

        const unitIDs = [...Array(unitsCount).keys()];
        unitIDs.forEach(idx => {
            const src_units = srcVehicleData.units;
            longVehicleData.units = longVehicleData.units.concat(src_units);

            const src_spaces = srcVehicleData.spaces.concat([spaceVehicle]);
            longVehicleData.spaces = longVehicleData.spaces.concat(src_spaces);
        });
        
        return longVehicleData;
    }

    addControls() {
        this.map.addControl(new mapboxgl.NavigationControl());
        const scaleControl = new mapboxgl.ScaleControl({
            maxWidth: 200
        });
        this.map.addControl(scaleControl);
    }

    addLayers() {
        this.map.addSource('mapbox-dem', {
            'type': 'raster-dem',
            'url': 'mapbox://mapbox.mapbox-terrain-dem-v1',
            'tileSize': 512,
            'maxzoom': 14
        });
        const terrainExagerration = 1.0; 
        map.setTerrain({ 'source': 'mapbox-dem', 'exaggeration': terrainExagerration});

        const mapSource = {
            type: 'geojson',
            data: {
                type: 'FeatureCollection',
                features: []
            }
        };
        this.map.addSource(this.layerSourceId, mapSource);
        
        const mapLayer = {
            id: 'vehicleLine',
            type: 'line',
            source: this.layerSourceId,
            paint: {
                'line-color': '#e2001a',
                'line-width': 6
            }
        }
        this.map.addLayer(mapLayer);
    }

    animate(fromDistance) {
        this.dataLoadPromise.then(data_responses => {
            const segmentFeatureJSON = data_responses[0];
            const pointsGeoJSON = data_responses[1];

            this.trackLength = segmentFeatureJSON['properties']['length'];
            this.computeIncrementPosition();

            this.pointsData = [];
            pointsGeoJSON.features.forEach(feature => {
                const pointData = {
                    dt: feature['properties']['dt'],
                    coords: feature.geometry.coordinates,
                }
                this.pointsData.push(pointData);
            });

            const vehicleType = 'capricorn_world_record';
            this.currentDistance = fromDistance;
            this.updateVehicleCoordinates('v1', vehicleType);

            this.renderVehicles();
            this.addEvents();
        });
    }

    computeIncrementPosition() {
        this.incrementPosition = this.trackSpeed * this.speedFactor * 1000 * this.animationTick / (3600 * 1000);
    }

    updateVehicleCoordinates(vehicleId, vehicleType, vertexIDx = 0) {
        vertexIDx = 0;
        const vehicleData = this.vehiclesData[vehicleType];

        let vehicleCoords = [];
        let unitFromDistance = this.currentDistance;
        vehicleData.units.forEach((unitLength, idx) => {
            const unitToDistance = unitFromDistance + unitLength;
            const coordsData = this.computeVehicleCoords(unitFromDistance, unitToDistance, vertexIDx);
            vehicleCoords.push(coordsData.coords);

            vertexIDx = coordsData.vertexIDx;
            const coachSpace = vehicleData.spaces[idx] ?? 0;

            unitFromDistance += unitLength + coachSpace;
        });

        this.mapVehiclesCoordsData[vehicleId] = vehicleCoords;

        if (this.animationTick) {
            setTimeout(() => {
                if (vehicleCoords[0].length > 0) {
                    this.currentDistance += this.incrementPosition;
                    this.updateVehicleCoordinates(vehicleId, vehicleType, vertexIDx);
                } else {
                    console.log('handle done');
                }
            }, this.animationTick);
        }
    }

    renderVehicles() {
        const features = [];
        const keys = Object.keys(this.mapVehiclesCoordsData);
        keys.forEach(vehicleId => {
            const vehicleCoords = this.mapVehiclesCoordsData[vehicleId];
            const vehicleFeature = {
                type: 'Feature',
                properties: {},
                geometry: {
                    type: 'MultiLineString',
                    coordinates: vehicleCoords
                }
            };
            features.push(vehicleFeature);
        });

        const vehicleGeoJSON = {
            type: 'FeatureCollection',
            features: features,
        };

        const source = map.getSource(this.layerSourceId);
        source.setData(vehicleGeoJSON);

        if (this.animationTick) {
            setTimeout(() => {
                this.renderVehicles();
            }, this.animationTick);
        }
    }

    interpolateCooords(pointDataA, pointDataB, dC_t) {
        const dRatio = (dC_t - pointDataA.dt) / (pointDataB.dt - pointDataA.dt);

        const delta_lng = pointDataB.coords[0] - pointDataA.coords[0];
        const delta_lat = pointDataB.coords[1] - pointDataA.coords[1];

        const pointC_lng = pointDataA.coords[0] + delta_lng * dRatio;
        const pointC_lat = pointDataA.coords[1] + delta_lat * dRatio;

        const coordsC = [+pointC_lng.toFixed(6), +pointC_lat.toFixed(6)];
        
        return coordsC;
    }

    computeVehicleCoords(fromDistance, toDistance, vertexIDx = 0) {
        const vehicleCoords = [];
        let point1 = null;
        let point2 = null;
        let newVertexIDx = null;

        this.pointsData.forEach((pointDataB, idx) => {
            if (point2 !== null) {
                return;
            }

            if (idx === 0) {
                return;
            }

            if (vertexIDx > idx) {
                return;
            }

            const pointDataA = this.pointsData[idx - 1];
            if ((point1 === null) && (fromDistance < pointDataB.dt)) {
                point1 = this.interpolateCooords(pointDataA, pointDataB, fromDistance);
                vehicleCoords.push(point1);
                newVertexIDx = idx;
            }
            if ((point1) && (toDistance < pointDataB.dt)) {
                point2 = this.interpolateCooords(pointDataA, pointDataB, toDistance);
                vehicleCoords.push(point2);
            }

            if ((point1 !== null) && (point2 === null)) {
                vehicleCoords.push(pointDataB.coords);
            }
        });

        const vehicleCoordsData = {
            vertexIDx: newVertexIDx,
            coords: vehicleCoords.slice()
        };

        return vehicleCoordsData;
    }
}

map.on('load', ev => {
    const shapeAnimator = new ShapeAnimator(map);
    
    // Preda
    // shapeAnimator.animate(7900);

    // Helical Tunnels
    shapeAnimator.animate(9700);
});
