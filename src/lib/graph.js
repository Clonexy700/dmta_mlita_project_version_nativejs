import { canvasManager } from '../canvasManager.js';
import { deserializeNode, deserializeArrow } from '../elements.js';
import { inputManager } from '../input.js';
import { API } from '../api.js';

class Graph {

    constructor() {
        this.graph = new Map();
        this.size = 0;
    }

    getKeys() {
        return this.graph.keys();
    }

    /**
     * @param {Node} v - index of state as a new vertex to add to graph
     */
    addVertex(v) {
        this.graph.set(v, []);
        this.size++;
    }

    /**
     * create a new directed edge between two vertices
     *
     * @param {Node} start
     * @param {Node} end
     */
    addEdge(start, end) {
        this.graph.get(start).push(end);
    }

    /**
     * @param {Node} v_ - node to delete
     */
    deleteVertex(v_) {
        this.graph.delete(v_);

        let keys = this.graph.keys();
        for (let u of keys) {
            let connections = this.graph.get(u);
            let index = 0;
            for (let v of connections) {
                if (v === v_) {
                    connections.splice(index, 1);
                }

                index++;
            }
        }

        this.size--;

    }

    /**
     * given two nodes delete the edge between them if it exists
     *
     * @param {Node} u - starting node of edge
     * @param {Node} v - ending node of edge 
     */
    deleteEdge(u, v) {
        let connections = this.graph.get(u);
        const index = connections.indexOf(v);
        connections.splice(index, 1);
    }


    getConnections(node) {
        return this.graph.get(node);
    }
}


function buildText(str) {
    return `
        <span>
            S<sub>${str}</sub>
        </span>
    `;
}

/**
 * @param {Node} Node to start from
 * @param {String} val what value to read from (IF,OUT,NEXT STATE label)
 */
function buildTransitionTableHelper(key, val) {
    let arrs = key.connected_arrows;
    let output = `<td class='t_tbl'>`;

    for (let arr of arrs) {
        if (arr.isDeparting(key)) {
            continue;
        }

        let data = null;
        output += "<div>"
        if (val === "IF") {
            data = `<span><sub>${arr.IF === "" ? 'ε' : arr.IF}</sub></span>`;
        } else if (val === "OUT") {
            data = `<span><sub>${arr.IF === "" ? 'ε' : arr.IF}</sub></span>`;
        } else {
            data = buildText(arr.end_node.label);
        }

        output += `${data}</div>`;

    }

    output += `</td>`
    return output;
}


/**
 * Construct a transition table based on the FSM
 * @param {String|null} tgt_element to draw too
 * @returns {String} HTML output
 */
function buildTransitionTable(tgt_element = null) {
    let CM = canvasManager.getInstance();

    let tbl = null;
    if (tgt_element) {
        tbl = document.getElementById(tgt_element);
    }

    let keys = CM.graph.getKeys();
    let extra = "";
    if (API.can_output) {
        extra = "<th> Output </th>";
    }

    let output = `
        <tr>
            <th> Состояние </th>
            <th> Переход </th>
            ${extra}
            <th> Следующее состояние </th>
        </tr>
    `;

    for (let key of keys) {
        output +=
            `<tr>
                <td class='t_tbl'>
                    ${buildText(key.label)}
                </td>
        `;


        output += `${buildTransitionTableHelper(key, "IF")}`
        if (API.can_output) {
            output += buildTransitionTableHelper(key, "OUT");
        }
        output += buildTransitionTableHelper(key, "");
        output += "</tr>";
    }

    if (tbl) {
        tbl.innerHTML = output;
    }

    return output;
}


/**
 * Save the state machine state into localstorage
 */
function save() {
    let CM = canvasManager.getInstance();
    let map = canvasManager.getInstance().map;

    let nodes = [];
    for (let x of CM.nodes) {
        nodes.push(x.serialize());
    }

    let arrows = [];
    for (let x of CM.arrows) {
        arrows.push(x.serialize());
    }

    if (!API.is_external) {
        //save the io table
        let IM = inputManager.getInstance().saveIOTable();
    }

    localStorage.setItem('object_map', JSON.stringify(map));
    localStorage.setItem('nodes', JSON.stringify(nodes));
    localStorage.setItem('arrows', JSON.stringify(arrows));
}


function load() {
    let CM = canvasManager.getInstance();
    CM.clearCanvas();

    //toggle auto save so re-adding elements doesn't cause problems
    CM.auto_save = !CM.auto_save;

    let objects = localStorage.getItem('object_map');
    let nodes = localStorage.getItem('nodes');
    let arrows = localStorage.getItem('arrows');

    if (!objects || !nodes || !arrows) {
        return;
    }

    nodes = JSON.parse(nodes);
    arrows = JSON.parse(arrows);
    objects = JSON.parse(objects);

    //rebuild nodes
    for (let n of nodes) {
        let new_node = deserializeNode(n);
        CM.addNewNode(new_node);
    }

    for (let a of arrows) {
        let new_arrow = deserializeArrow(a);
        //try and find its start and end nodes

        let start = CM.getObjFromID(new_arrow.start_node);
        let end = CM.getObjFromID(new_arrow.end_node);

        if (!start || !end) {
            throw 'Failed to find Arrow starting and or ending node from save data';
        }

        CM.addNewArrow(start, end);
        let last = CM.arrows[CM.arrows.length - 1];

        for (let prop in last) {
            if (prop === "start_node" || prop === "end_node") {
                continue;
            }

            last[prop] = new_arrow[prop];
        }

    }

    if (!API.is_external) {
        inputManager.getInstance().loadIOTable();
    }
}


export {
    Graph,
    buildTransitionTable,
    save,
    load
}