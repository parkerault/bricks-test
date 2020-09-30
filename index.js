"use strict";
const defaultState = {
    sheet: {
        columnCount: 500,
        rowCount: 500,
        dimensions: { x: 0, y: 0 },
    },
    viewportRect: { x: 0, y: 0, width: 0, height: 0 },
    visibleColumns: [],
    visibleRows: [],
    cells: [],
    defaultCellDimensions: { x: 120, y: 40 },
    window: windowReader(window),
};
/**
 * -----------------------------------------------------------------------------
 * SHEET REDUCER
 * -----------------------------------------------------------------------------
 */
const sheetReducer = ({ state, action }) => {
    switch (action.type) {
        case "init": {
            const dimensions = {
                x: state.sheet.columnCount * state.defaultCellDimensions.x,
                y: state.sheet.rowCount * state.defaultCellDimensions.y,
            };
            return {
                action,
                state: Object.assign(Object.assign({}, state), { sheet: Object.assign(Object.assign({}, state.sheet), { dimensions }) }),
            };
        }
        default:
            return { state, action };
    }
};
/**
 * -----------------------------------------------------------------------------
 * VIEWPORT RECT REDUCER
 * -----------------------------------------------------------------------------
 */
const viewportRectReducer = ({ state, action }) => {
    switch (action.type) {
        case "init":
            return {
                action,
                state: Object.assign(Object.assign({}, state), { viewportRect: {
                        x: state.window.scrollX(),
                        y: state.window.scrollY(),
                        width: state.window.innerWidth(),
                        height: state.window.innerHeight(),
                    } }),
            };
        case "scroll":
            return {
                action,
                state: Object.assign(Object.assign({}, state), { viewportRect: Object.assign(Object.assign({}, state.viewportRect), { x: state.window.scrollX(), y: state.window.scrollY() }) }),
            };
        default:
            return { state, action };
    }
};
/**
 * -----------------------------------------------------------------------------
 * CELLS REDUCER
 * -----------------------------------------------------------------------------
 */
function cellConstructor(dimensions, column, row) {
    return {
        column,
        row,
        text: `${column}:${row}`,
        position: { x: column * dimensions.x, y: row * dimensions.y },
        node: null,
        dirty: true,
    };
}
function getVisibleColumns(viewportRect, cellDimensions) {
    const columnsFromOrigin = Math.floor(viewportRect.x / cellDimensions.x);
    const visibleColumnCount = Math.ceil(viewportRect.width / cellDimensions.x);
    return Array.from({ length: visibleColumnCount }).map((_, i) => columnsFromOrigin + i);
}
function getVisibleRows(viewportRect, cellDimensions) {
    const rowsFromOrigin = Math.floor(viewportRect.y / cellDimensions.y);
    const visibleRowCount = Math.ceil(viewportRect.height / cellDimensions.y);
    return Array.from({ length: visibleRowCount }).map((_, i) => rowsFromOrigin + i);
}
function diffGroups(prev, next) {
    // Use a set for faster lookup
    const prevSet = new Set(prev);
    const nextSet = new Set(next);
    const added = next.filter((x) => !prevSet.has(x));
    const removed = prev.filter((x) => !nextSet.has(x));
    return { added, removed };
}
const cellsReducer = ({ state, action }) => {
    const { viewportRect, defaultCellDimensions: cellDimensions, } = state;
    switch (action.type) {
        case "init": {
            let cells = [];
            const visibleColumns = getVisibleColumns(viewportRect, cellDimensions);
            const visibleRows = getVisibleRows(viewportRect, cellDimensions);
            const rowStart = visibleRows[0];
            const rowEnd = visibleRows[visibleRows.length - 1];
            const columnStart = visibleColumns[0];
            const columnEnd = visibleColumns[visibleColumns.length - 1];
            for (let row = rowStart; row <= rowEnd; row++) {
                for (let column = columnStart; column <= columnEnd; column++) {
                    const cell = cellConstructor(cellDimensions, column, row);
                    cells.push(cell);
                }
            }
            return {
                action,
                state: Object.assign(Object.assign({}, state), { visibleColumns,
                    visibleRows,
                    cells }),
            };
        }
        case "scroll": {
            const visible = {
                columns: getVisibleColumns(viewportRect, cellDimensions),
                rows: getVisibleRows(viewportRect, cellDimensions),
            };
            const columnsDiff = diffGroups(state.visibleColumns.concat(), visible.columns);
            const rowsDiff = diffGroups(state.visibleRows.concat(), visible.rows);
            // here we are assuming that the removed list has the same length as the
            // added list. We have to loop over every cell twice to move columns and
            // rows separately.
            const cells = state.cells.map((cell) => {
                const colIdx = columnsDiff.removed.indexOf(cell.column);
                const rowIdx = rowsDiff.removed.indexOf(cell.row);
                if (colIdx < 0 && rowIdx < 0)
                    return cell;
                let column = cell.column;
                let row = cell.row;
                let position = Object.assign({}, cell.position);
                let dirty = false;
                if (colIdx >= 0) {
                    column = columnsDiff.added[colIdx];
                    position.x = column * cellDimensions.x;
                    dirty = true;
                }
                if (rowIdx >= 0) {
                    row = rowsDiff.added[rowIdx];
                    position.y = row * cellDimensions.y;
                    dirty = true;
                }
                if (dirty === true) {
                    return Object.assign(Object.assign({}, cell), { column,
                        row,
                        position, text: `${column}:${row}`, dirty });
                }
                return cell;
            });
            return {
                action,
                state: Object.assign(Object.assign({}, state), { visibleColumns: visible.columns, visibleRows: visible.rows, cells }),
            };
        }
        default:
            return { state, action };
    }
};
;
;
;
;
;
const reducer = pipeReducers(sheetReducer, viewportRectReducer, cellsReducer);
function renderUnsafe(state) {
    const { cells } = state;
    const len = cells.length;
    const batchSize = 250;
    let idx = 0;
    const renderCell = () => {
        const end = idx + batchSize <= len ? idx + batchSize : len;
        const slice = cells.slice(idx, end);
        for (let cell of slice) {
            if (cell.dirty) {
                const { position: { x, y }, } = cell;
                cell.node.style.transform = `translate(${x}px, ${y}px)`;
                cell.node.innerText = cell.text;
                cell.dirty = false;
            }
        }
        idx = end;
        if (idx < len)
            requestAnimationFrame(renderCell);
    };
    requestAnimationFrame(renderCell);
}
function init(root, head) {
    let { state } = reducer({
        state: defaultState,
        action: { type: "init" },
    });
    const stylesheet = initializeStylesheet(state.defaultCellDimensions, {
        x: state.sheet.columnCount,
        y: state.sheet.rowCount,
    });
    head.appendChild(stylesheet);
    const fragment = document.createDocumentFragment();
    const sheetNode = document.createElement("div");
    sheetNode.className = "sheet";
    const cellNodes = state.cells.map((cell) => {
        const cellNode = document.createElement("span");
        cellNode.className = "cell";
        cellNode.style.transform = `translate(${cell.position.x}px, ${cell.position.y}px)`;
        cellNode.innerText = cell.text;
        cell.dirty = false; // Bad, but I can't think of a better way.
        cell.node = cellNode;
        return cellNode;
    });
    fragment.appendChild(sheetNode);
    cellNodes.forEach((node) => {
        sheetNode.appendChild(node);
    });
    root.appendChild(fragment);
    const scroll = () => {
        const { state: nextState } = reducer({ state, action: { type: "scroll" } });
        renderUnsafe(nextState);
        state = nextState;
    };
    const onScroll = throttle(scroll, 32);
    document.addEventListener("scroll", onScroll, { passive: true });
}
const root = document.getElementById("root");
const head = document.head;
if (root) {
    init(root, head);
}
/**
 * -----------------------------------------------------------------------------
 * UTILS
 * -----------------------------------------------------------------------------
 */
function windowReader(window) {
    return {
        scrollX: () => window.scrollX,
        scrollY: () => window.scrollY,
        innerWidth: () => window.innerWidth,
        innerHeight: () => window.innerHeight,
    };
}
function documentProvider(document) {
    return {
        createElement: document.createElement,
        appendChild: document.appendChild,
    };
}
function pipeReducers(...reducers) {
    return reducers.reduce((f, g) => (input) => g(f(input)));
}
// function clamp(min: number, max: number, value: number): number {
//   return Math.max(min, Math.min(max, value))
// }
function padRect(padding, rect) {
    return {
        x: Math.max(0, rect.x - padding),
        y: Math.max(0, rect.y - padding),
        width: rect.width + padding,
        height: rect.height + padding,
    };
}
function throttle(fn, delay) {
    let timerId = null;
    return (...args) => {
        if (timerId)
            return;
        timerId = window.setTimeout(() => {
            fn(...args);
            timerId = null;
        }, delay);
    };
}
function initializeStylesheet(cellDimensions, cellCount) {
    const stylesheet = document.createElement("style");
    stylesheet.setAttribute("type", "text/css");
    stylesheet.innerText = `\
    .sheet {\
      display: relative;\
      width: ${cellCount.x * cellDimensions.x}px;\
      height: ${cellCount.y * cellDimensions.y}px;\
      font-family: "Helvetica Neue", Helvetica, Segoe, sans-serif;\
      font-size: 12px;\
      font-weight: bold;\
    }\
\
    .cell {\
      position: absolute;\
      border: 1px solid gray;\
      width: ${cellDimensions.x}px;\
      height: ${cellDimensions.y}px;\
      display: flex;\
      justify-content: center;\
      align-items: center;\
    }\
  `;
    return stylesheet;
}
function testAssert(assertion, success, failure) {
    if (assertion)
        console.debug(success);
    else
        console.debug(failure);
}
