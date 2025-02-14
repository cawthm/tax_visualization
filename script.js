// Initialize the visualization
const margin = { top: 40, right: 120, bottom: 60, left: 60 };
const width = 600 - margin.left - margin.right;
const height = 400 - margin.top - margin.bottom;

// Create the SVG container
const svg = d3.select('#graph')
    .append('svg')
    .attr('width', width + margin.left + margin.right)
    .attr('height', height + margin.top + margin.bottom)
    .append('g')
    .attr('transform', `translate(${margin.left},${margin.top})`);

// Set up scales
const x = d3.scaleLinear()
    .domain([0, 100])
    .range([0, width]);

const y = d3.scaleLinear()
    .domain([0, 10])
    .range([height, 0]);

// Add axes
svg.append('g')
    .attr('class', 'x axis')
    .attr('transform', `translate(0,${height})`)
    .call(d3.axisBottom(x));

svg.append('g')
    .attr('class', 'y axis')
    .call(d3.axisLeft(y).tickFormat(d => `$${d}`));

// Add axis labels
svg.append('text')
    .attr('class', 'x label')
    .attr('text-anchor', 'end')  // Right-align the text
    .attr('x', width + 40)  // Position it 40px right of the graph end
    .attr('y', height + 35)  // Slightly above the bottom margin
    .text('Quantity');

svg.append('text')
    .attr('class', 'y label')
    .attr('text-anchor', 'middle')
    .attr('x', -20)  // Move right a bit
    .attr('y', -15)  // Move down a bit
    .text('Price');

// Modify state to remove taxEnabled and taxType, just keep taxAmount and taxRecipient
let state = {
    supplyElasticity: 1,
    demandElasticity: 1,
    taxAmount: 0,  // Can be negative (subsidy) or positive (tax)
    taxRecipient: 'S',  // 'S' for supply, 'D' for demand
    // Store the actual supply line endpoints
    supplyLine: {
        p1: { x: 0, y: 1 },    // y-intercept at $1
        p2: { x: 90, y: 10 }   // slope of 0.1 (rise of 9 over run of 90)
    },
    // Add demand line endpoints
    demandLine: {
        p1: { x: 0, y: 10 },   // Initial start point
        p2: { x: 100, y: 0 }   // Initial end point
    }
};

// Add after the state initialization
let draggedCurve = null;
let dragStartY = null;

// Helper functions
function getSupplyCurvePoints(elasticity, shift = 0) {
    // For the base supply curve, just return the stored points
    if (shift === 0 || state.taxRecipient === 'D') {
        return [
            { x: state.supplyLine.p1.x, y: state.supplyLine.p1.y },
            { x: state.supplyLine.p2.x, y: state.supplyLine.p2.y }
        ];
    }
    // For shifted supply curve (with tax), translate the points vertically
    return [
        { x: state.supplyLine.p1.x, y: state.supplyLine.p1.y + shift },
        { x: state.supplyLine.p2.x, y: state.supplyLine.p2.y + shift }
    ];
}

function getDemandCurvePoints(elasticity, shift = 0) {
    // For the base demand curve, just return the stored points
    if (shift === 0 || state.taxRecipient === 'S') {
        return [
            { x: state.demandLine.p1.x, y: state.demandLine.p1.y },
            { x: state.demandLine.p2.x, y: state.demandLine.p2.y }
        ];
    }
    // For shifted demand curve (with tax), translate the points vertically
    return [
        { x: state.demandLine.p1.x, y: state.demandLine.p1.y - shift },  // Subtract shift for demand (tax shifts demand down)
        { x: state.demandLine.p2.x, y: state.demandLine.p2.y - shift }   // Negative shift (subsidy) moves up, positive (tax) moves down
    ];
}

function calculateEquilibrium(supplyPoints, demandPoints) {
    const s1 = supplyPoints[0];
    const s2 = supplyPoints[1];
    const d1 = demandPoints[0];
    const d2 = demandPoints[1];
    
    const supplySlope = (s2.y - s1.y) / (s2.x - s1.x);
    const demandSlope = (d2.y - d1.y) / (d2.x - d1.x);
    
    const supplyIntercept = s1.y - supplySlope * s1.x;
    const demandIntercept = d1.y - demandSlope * d1.x;
    
    const x = (demandIntercept - supplyIntercept) / (supplySlope - demandSlope);
    const y = supplySlope * x + supplyIntercept;
    
    return { x, y };
}

function calculateSurplus(equilibrium, supplyPoints, demandPoints) {
    // For consumer surplus: area of triangle between demand curve and equilibrium price
    const demandIntercept = demandPoints[0].y;  // Use y-intercept of demand curve
    const consumerSurplus = Math.abs((demandIntercept - equilibrium.y) * equilibrium.x) / 2;
    
    // For producer surplus: area between supply curve and equilibrium price
    const supplyIntercept = supplyPoints[0].y;  // Use y-intercept of supply curve
    const producerSurplus = Math.abs((equilibrium.y - supplyIntercept) * equilibrium.x) / 2;
    
    console.log('Surplus Calculation Debug:');
    console.log('Equilibrium:', equilibrium);
    console.log('Demand Intercept:', demandIntercept);
    console.log('Supply Intercept:', supplyIntercept);
    console.log('Consumer Surplus:', consumerSurplus);
    console.log('Producer Surplus:', producerSurplus);
    
    return { consumerSurplus, producerSurplus };
}

function getPointOnLine(point1, point2, x) {
    const slope = (point2.y - point1.y) / (point2.x - point1.x);
    return point1.y + slope * (x - point1.x);
}

// Add before updateVisualization
function handleDragStart(curve) {
    return function(event) {
        draggedCurve = curve;
        dragStartY = event.y;
        d3.select(this).raise().classed('active', true);
    };
}

function handleDrag(event) {
    if (!draggedCurve) return;
    
    // Only convert vertical movement to price units
    const dy = y.invert(event.y) - y.invert(event.y - event.dy);
    
    if (draggedCurve === 'supply') {
        // Update only the y-coordinates of supply endpoints
        state.supplyLine.p1.y += dy;
        state.supplyLine.p2.y += dy;
    } else if (draggedCurve === 'demand') {
        // Update only the y-coordinates of demand endpoints
        state.demandLine.p1.y += dy;
        state.demandLine.p2.y += dy;
    }
    
    updateVisualization();
}

function handleDragEnd() {
    draggedCurve = null;
    dragStartY = null;
    d3.select(this).classed('active', false);
}

// Update visualization
function updateVisualization() {
    // Remove existing areas and labels
    svg.selectAll('.area').remove();
    svg.selectAll('.equilibrium-label').remove();
    
    // Calculate curve points
    const taxShift = state.taxAmount;  // No need to check taxEnabled or taxType
    
    const supplyPoints = getSupplyCurvePoints(state.supplyElasticity);
    const demandPoints = getDemandCurvePoints(state.demandElasticity);
    const shiftedSupplyPoints = getSupplyCurvePoints(state.supplyElasticity, taxShift);
    const shiftedDemandPoints = getDemandCurvePoints(state.demandElasticity, taxShift);
    
    // Calculate equilibrium points
    const baseEquilibrium = calculateEquilibrium(supplyPoints, demandPoints);
    const newEquilibrium = Math.abs(taxShift) > 0 ? 
        calculateEquilibrium(
            state.taxRecipient === 'S' ? shiftedSupplyPoints : supplyPoints,
            state.taxRecipient === 'D' ? shiftedDemandPoints : demandPoints
        ) : baseEquilibrium;

    // Add equilibrium labels
    // Original equilibrium labels (always shown, but greyed when tax/subsidy active)
    svg.append('text')
        .attr('class', 'equilibrium-label')
        .attr('x', x(0) - 25)
        .attr('y', y(baseEquilibrium.y))
        .attr('text-anchor', 'end')
        .attr('alignment-baseline', 'middle')
        .attr('font-size', '12px')
        .attr('fill', Math.abs(taxShift) > 0 ? '#999' : '#666')
        .html('P<tspan baseline-shift="sub" font-size="8px">E</tspan>');

    svg.append('text')
        .attr('class', 'equilibrium-label')
        .attr('x', x(baseEquilibrium.x))
        .attr('y', y(0) + 35)
        .attr('text-anchor', 'middle')
        .attr('font-size', '12px')
        .attr('fill', Math.abs(taxShift) > 0 ? '#999' : '#666')
        .html('Q<tspan baseline-shift="sub" font-size="8px">E</tspan>');

    // Add extended dashed lines to axes for original equilibrium
    svg.append('line')
        .attr('class', 'equilibrium-label')
        .attr('x1', x(0) - 20)
        .attr('y1', y(baseEquilibrium.y))
        .attr('x2', x(baseEquilibrium.x))
        .attr('y2', y(baseEquilibrium.y))
        .attr('stroke', Math.abs(taxShift) > 0 ? '#999' : '#666')
        .attr('stroke-width', 1)
        .attr('stroke-dasharray', '3,3');

    svg.append('line')
        .attr('class', 'equilibrium-label')
        .attr('x1', x(baseEquilibrium.x))
        .attr('y1', y(0) + 30)
        .attr('x2', x(baseEquilibrium.x))
        .attr('y2', y(baseEquilibrium.y))
        .attr('stroke', Math.abs(taxShift) > 0 ? '#999' : '#666')
        .attr('stroke-width', 1)
        .attr('stroke-dasharray', '3,3');

    // Add new equilibrium labels if tax/subsidy is active
    if (Math.abs(taxShift) > 0) {
        const postTaxPrice = state.taxRecipient === 'S' ? newEquilibrium.y : newEquilibrium.y + taxShift;
        const preTaxPrice = state.taxRecipient === 'S' ? newEquilibrium.y - taxShift : newEquilibrium.y;
        
        // PPaid label
        svg.append('text')
            .attr('class', 'equilibrium-label')
            .attr('x', x(0) - 25)
            .attr('y', y(postTaxPrice))
            .attr('text-anchor', 'end')
            .attr('alignment-baseline', 'middle')
            .attr('font-size', '12px')
            .html('P<tspan baseline-shift="sub" font-size="8px">Paid</tspan>');

        // PRecd label
        svg.append('text')
            .attr('class', 'equilibrium-label')
            .attr('x', x(0) - 25)
            .attr('y', y(preTaxPrice))
            .attr('text-anchor', 'end')
            .attr('alignment-baseline', 'middle')
            .attr('font-size', '12px')
            .html('P<tspan baseline-shift="sub" font-size="8px">Rec\'d</tspan>');

        // Q label with appropriate subscript
        svg.append('text')
            .attr('class', 'equilibrium-label')
            .attr('x', x(newEquilibrium.x))
            .attr('y', y(0) + 50)  // Position below QE
            .attr('text-anchor', 'middle')
            .attr('font-size', '12px')
            .html(`Q<tspan baseline-shift="sub" font-size="8px">${taxShift > 0 ? 'Tax' : 'Subsidy'}</tspan>`);

        // Add dashed lines for new prices and quantity
        // PPaid horizontal line
        svg.append('line')
            .attr('class', 'equilibrium-label')
            .attr('x1', x(0) - 20)
            .attr('y1', y(postTaxPrice))
            .attr('x2', x(newEquilibrium.x))
            .attr('y2', y(postTaxPrice))
            .attr('stroke', '#666')
            .attr('stroke-width', 1)
            .attr('stroke-dasharray', '3,3');

        // PRecd horizontal line
        svg.append('line')
            .attr('class', 'equilibrium-label')
            .attr('x1', x(0) - 20)
            .attr('y1', y(preTaxPrice))
            .attr('x2', x(newEquilibrium.x))
            .attr('y2', y(preTaxPrice))
            .attr('stroke', '#666')
            .attr('stroke-width', 1)
            .attr('stroke-dasharray', '3,3');

        // New quantity vertical line
        svg.append('line')
            .attr('class', 'equilibrium-label')
            .attr('x1', x(newEquilibrium.x))
            .attr('y1', y(0) + 45)  // Start from below the new Q label
            .attr('x2', x(newEquilibrium.x))
            .attr('y2', y(newEquilibrium.y))
            .attr('stroke', '#666')
            .attr('stroke-width', 1)
            .attr('stroke-dasharray', '3,3');
    }

    // Draw areas first (so they're behind the lines)
    if (Math.abs(taxShift) > 0) {
        // Consumer Surplus (blue triangle) - area between demand curve and post-tax price
        const postTaxPrice = state.taxRecipient === 'S' ? newEquilibrium.y : newEquilibrium.y + taxShift;
        const preTaxPrice = state.taxRecipient === 'S' ? newEquilibrium.y - taxShift : newEquilibrium.y;
        
        // Find where demand curve intersects with shifted supply curve
        const demandSlope = (demandPoints[1].y - demandPoints[0].y) / (demandPoints[1].x - demandPoints[0].x);
        const demandIntercept = demandPoints[0].y;
        
        const csPoints = [
            { x: 0, y: demandIntercept },  // Demand curve y-intercept
            { x: newEquilibrium.x, y: getPointOnLine(demandPoints[0], demandPoints[1], newEquilibrium.x) },  // Where demand meets shifted supply
            { x: newEquilibrium.x, y: postTaxPrice },  // Up to post-tax price
            { x: 0, y: postTaxPrice }  // Back to y-axis at post-tax price
        ];
        
        svg.append('path')
            .datum(csPoints)
            .attr('class', 'area consumer-surplus')
            .attr('d', d3.line()
                .x(d => x(d.x))
                .y(d => y(d.y)));

        // Producer Surplus (green triangle) - area between supply curve and price received by sellers
        const psPoints = [
            { x: 0, y: getPointOnLine(supplyPoints[0], supplyPoints[1], 0) },  // Start at supply curve y-intercept
            { x: newEquilibrium.x, y: getPointOnLine(supplyPoints[0], supplyPoints[1], newEquilibrium.x) },  // Follow supply curve to new Q
            { x: newEquilibrium.x, y: preTaxPrice },  // Down to pre-tax price
            { x: 0, y: preTaxPrice }  // Back to y-axis at pre-tax price
        ];
        
        svg.append('path')
            .datum(psPoints)
            .attr('class', 'area producer-surplus')
            .attr('d', d3.line()
                .x(d => x(d.x))
                .y(d => y(d.y)));

        // Deadweight Loss (red triangle)
        const dwlPoints = [
            { x: newEquilibrium.x, y: getPointOnLine(supplyPoints[0], supplyPoints[1], newEquilibrium.x) },
            { x: baseEquilibrium.x, y: baseEquilibrium.y },
            { x: newEquilibrium.x, y: getPointOnLine(demandPoints[0], demandPoints[1], newEquilibrium.x) }
        ];
        
        svg.append('path')
            .datum(dwlPoints)
            .attr('class', 'area deadweight-loss')
            .attr('d', d3.line()
                .x(d => x(d.x))
                .y(d => y(d.y))
                .curve(d3.curveLinearClosed));
    } else {
        // Base case - just show consumer and producer surplus
        // Consumer Surplus - handle both triangle and polygon cases
        const demandSlope = (demandPoints[1].y - demandPoints[0].y) / (demandPoints[1].x - demandPoints[0].x);
        const demandIntercept = demandPoints[0].y;
        
        // Find where demand curve intersects P=$10 line (if it does)
        const xAtMaxPrice = (10 - demandIntercept) / demandSlope;
        
        let csPoints;
        // Triangle case - use the actual demand curve point at equilibrium
        csPoints = [
            { x: 0, y: getPointOnLine(demandPoints[0], demandPoints[1], 0) },  // Start at demand y-intercept
            { x: baseEquilibrium.x, y: getPointOnLine(demandPoints[0], demandPoints[1], baseEquilibrium.x) },  // Point on demand curve
            { x: baseEquilibrium.x, y: baseEquilibrium.y },  // Equilibrium point
            { x: 0, y: baseEquilibrium.y }  // Back to y-axis at equilibrium price
        ];
        
        svg.append('path')
            .datum(csPoints)
            .attr('class', 'area consumer-surplus')
            .attr('d', d3.line()
                .x(d => x(d.x))
                .y(d => y(d.y)));

        // Producer Surplus (green triangle)
        const psPoints = [
            { x: 0, y: getPointOnLine(supplyPoints[0], supplyPoints[1], 0) },  // Start at supply y-intercept
            { x: baseEquilibrium.x, y: getPointOnLine(supplyPoints[0], supplyPoints[1], baseEquilibrium.x) },  // Point on supply curve
            { x: baseEquilibrium.x, y: baseEquilibrium.y },  // Equilibrium point
            { x: 0, y: baseEquilibrium.y }  // Back to y-axis at equilibrium price
        ];
        
        svg.append('path')
            .datum(psPoints)
            .attr('class', 'area producer-surplus')
            .attr('d', d3.line()
                .x(d => x(d.x))
                .y(d => y(d.y)));
    }

    // Draw supply curve
    const supplyLine = d3.line()
        .x(d => x(d.x))
        .y(d => y(d.y));

    svg.selectAll('.supply-line').remove();
    
    // Draw base supply curve with drag behavior
    const supplyPath = svg.append('path')
        .datum(supplyPoints)
        .attr('class', 'line supply-line')
        .attr('d', supplyLine)
        .style('cursor', 'ns-resize')
        .call(d3.drag()
            .on('start', handleDragStart('supply'))
            .on('drag', handleDrag)
            .on('end', handleDragEnd));

    // Draw shifted supply curve if supply is tax recipient
    if (Math.abs(taxShift) > 0 && state.taxRecipient === 'S') {
        svg.append('path')
            .datum(shiftedSupplyPoints)
            .attr('class', 'line supply-line')
            .style('stroke-dasharray', '4,4')
            .attr('d', supplyLine);
    }

    // Draw demand curve
    const demandLine = d3.line()
        .x(d => x(d.x))
        .y(d => y(d.y));

    svg.selectAll('.demand-line').remove();
    
    // Draw base demand curve with drag behavior
    svg.append('path')
        .datum(demandPoints)
        .attr('class', 'line demand-line')
        .attr('d', demandLine)
        .style('cursor', 'ns-resize')
        .call(d3.drag()
            .on('start', handleDragStart('demand'))
            .on('drag', handleDrag)
            .on('end', handleDragEnd));

    // Draw shifted demand curve if demand is tax recipient
    if (Math.abs(taxShift) > 0 && state.taxRecipient === 'D') {
        svg.append('path')
            .datum(shiftedDemandPoints)
            .attr('class', 'line demand-line')
            .style('stroke-dasharray', '4,4')
            .attr('d', demandLine);
    }

    // Calculate and update surpluses
    const baseSurplus = calculateSurplus(baseEquilibrium, supplyPoints, demandPoints);
    let newSurplus;
    if (Math.abs(taxShift) > 0) {
        const postTaxPrice = state.taxRecipient === 'S' ? newEquilibrium.y : newEquilibrium.y + taxShift;
        const preTaxPrice = state.taxRecipient === 'S' ? newEquilibrium.y - taxShift : newEquilibrium.y;
        
        // For consumer surplus: area between demand curve and PPaid (post-tax price)
        const demandIntercept = demandPoints[0].y;
        const consumerSurplus = Math.abs((demandIntercept - postTaxPrice) * newEquilibrium.x) / 2;
        
        // For producer surplus: area between PRec'd (pre-tax price) and supply curve
        const supplyIntercept = supplyPoints[0].y;
        const producerSurplus = Math.abs((preTaxPrice - supplyIntercept) * newEquilibrium.x) / 2;
        
        newSurplus = { consumerSurplus, producerSurplus };
    } else {
        newSurplus = baseSurplus;
        console.log('No Tax Case - Final Surplus Values:');
        console.log('Base/New Surplus:', baseSurplus);
    }

    // Calculate tax revenue and deadweight loss
    let taxRevenue = 0;
    let deadweightLoss = 0;
    
    if (Math.abs(taxShift) > 0) {
        taxRevenue = Math.abs(taxShift * newEquilibrium.x);
        
        // Calculate deadweight loss as the area of the triangle
        // Get the points on supply and demand curves at the new quantity
        const supplyPoint = getPointOnLine(supplyPoints[0], supplyPoints[1], newEquilibrium.x);
        const demandPoint = getPointOnLine(demandPoints[0], demandPoints[1], newEquilibrium.x);
        
        // Triangle base = difference between points on supply and demand curves
        const triangleHeight = Math.abs(supplyPoint - demandPoint);
        // Triangle height = difference between new and original equilibrium quantity
        const triangleBase = Math.abs(newEquilibrium.x - baseEquilibrium.x);
        
        deadweightLoss = (triangleBase * triangleHeight) / 2;
    }

    // Update display values
    console.log('Updating Display Values:');
    console.log('Consumer Surplus:', newSurplus.consumerSurplus);
    console.log('Producer Surplus:', newSurplus.producerSurplus);
    
    const csElement = document.getElementById('consumer-surplus');
    const psElement = document.getElementById('producer-surplus');
    const trElement = document.getElementById('tax-revenue');
    const dwlElement = document.getElementById('deadweight-loss');
    const trBox = document.getElementById('tax-revenue-box');
    const trLabel = document.getElementById('tax-revenue-label');
    
    console.log('Found Elements:', {
        csElement,
        psElement,
        trElement,
        dwlElement,
        trBox,
        trLabel
    });
    
    if (csElement) csElement.textContent = `$${newSurplus.consumerSurplus.toFixed(2)}`;
    if (psElement) psElement.textContent = `$${newSurplus.producerSurplus.toFixed(2)}`;
    if (trElement) trElement.textContent = `$${taxRevenue.toFixed(2)}`;
    if (dwlElement) dwlElement.textContent = `$${deadweightLoss.toFixed(2)}`;
    
    // Update tax revenue box style and label based on tax/subsidy
    if (trBox && trLabel) {
        if (taxShift < 0) {  // Subsidy case
            trLabel.textContent = 'Subsidy Cost';
        } else {  // Tax or no tax case
            trLabel.textContent = 'Tax Revenue';
        }
    }
}

// Event listeners
document.getElementById('supply-elasticity').addEventListener('input', (e) => {
    const newElasticity = parseFloat(e.target.value);
    // Calculate new slope - more elastic = flatter (smaller slope)
    const baseSlope = 0.1;  // This is our reference slope that corresponds to elasticity of 1.0
    const newSlope = baseSlope / newElasticity;  // Divide by elasticity to make it flatter
    
    // Fix p1 at (0, $1)
    state.supplyLine.p1 = { x: 0, y: 1 };
    
    // Find where line hits either price ceiling ($10) or quantity limit (100)
    // Using point-slope form: (y - y1) = m(x - x1)
    // Solve for x when y = 10: x = (10 - 1)/m
    const xAtPriceCeiling = (10 - 1) / newSlope;
    
    if (xAtPriceCeiling <= 100) {
        // Line hits price ceiling before quantity limit
        state.supplyLine.p2 = { x: xAtPriceCeiling, y: 10 };
    } else {
        // Line hits quantity limit first
        // Find y at x = 100: y = m(100) + 1
        const yAtQuantityLimit = newSlope * 100 + 1;
        state.supplyLine.p2 = { x: 100, y: yAtQuantityLimit };
    }
    
    state.supplyElasticity = newElasticity;
    document.getElementById('supply-elasticity-value').textContent = newElasticity.toFixed(1);
    updateVisualization();
});

document.getElementById('demand-elasticity').addEventListener('input', (e) => {
    const newElasticity = parseFloat(e.target.value);
    // Calculate new slope - more elastic = flatter (smaller absolute slope)
    const baseSlope = -0.1;  // This is our reference slope that corresponds to elasticity of 1.0
    const newSlope = baseSlope / newElasticity;  // Divide by elasticity to make it flatter
    
    // Fix p1 at (0, $10)
    state.demandLine.p1 = { x: 0, y: 10 };
    
    // Find where line hits either price floor ($0) or quantity limit (100)
    // Using point-slope form: (y - y1) = m(x - x1)
    // Solve for x when y = 0: x = (0 - 10)/m
    const xAtPriceFloor = (0 - 10) / newSlope;
    
    if (xAtPriceFloor <= 100) {
        // Line hits price floor before quantity limit
        state.demandLine.p2 = { x: xAtPriceFloor, y: 0 };
    } else {
        // Line hits quantity limit first
        // Find y at x = 100: y = m(100) + 10
        const yAtQuantityLimit = newSlope * 100 + 10;
        state.demandLine.p2 = { x: 100, y: yAtQuantityLimit };
    }
    
    state.demandElasticity = newElasticity;
    document.getElementById('demand-elasticity-value').textContent = newElasticity.toFixed(1);
    updateVisualization();
});

document.getElementById('tax-amount').addEventListener('input', (e) => {
    state.taxAmount = parseFloat(e.target.value);
    document.getElementById('tax-amount-value').textContent = state.taxAmount.toFixed(1);
    updateVisualization();
});

// Replace the checkbox event listener with radio button listeners
document.getElementById('tax-recipient-s').addEventListener('change', (e) => {
    if (e.target.checked) {
        state.taxRecipient = 'S';
        updateVisualization();
    }
});

document.getElementById('tax-recipient-d').addEventListener('change', (e) => {
    if (e.target.checked) {
        state.taxRecipient = 'D';
        updateVisualization();
    }
});

// Initial render
updateVisualization(); 