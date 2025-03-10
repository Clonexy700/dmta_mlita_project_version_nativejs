import { API } from './api.js';
import { canvasManager } from './canvasManager.js';


var simManager = (function() {
    var instance = null;

    return {
        clear: function() {
            instance = null;
        },

        getInstance: function() {
            if (!instance) {
                instance = new __SIM_MANAGER();
            }
            return instance;
        }
    };
})();


class __SIM_MANAGER {
    constructor() {
        this.has_started = false;
        this.branches = [];
        this.str_index = 0;
        this.use_epsilon = false;
        this.current_branch_open = 0;
        this.is_deterministic = true;
        this.display_all = true;

        API.config['dfa'] = true;
        API.config['nfa'] = true;
    }

    resetSim() { resetSim(); }

    getCurrentBranch() {
        if (!this.branches[this.current_branch_open]) {
            return { current_node_index: -1 };
        }

        return this.branches[this.current_branch_open];
    }

    getTotalSteps() {
        let ret = 0;
        for (let branch of this.branches) {
            ret += branch.num_steps;
        }
        return ret;
    }
}

function copyStack(old_s, new_s) {
    new_s.stack = old_s.stack;
    new_s.stack_index = old_s.stack_index;
}

function copyTape(old_t, new_t) {
    for (let x in old_t) {
        if (x === 'tgt_index') {
            continue;
        }
        new_t[x] = old_t[x];
    }
}

function copyTapePrims(old_t, new_t) {
    for (let x in old_t) {
        if (x === 'mem') {
            continue;
        }
        new_t[x] = old_t[x];
    }
}

class SimState {
    constructor(start_node_index, string, index = 0, inner_str_index = 0) {
        this.current_node_index = start_node_index;
        this.string = string;
        this.inner_str_index = inner_str_index;
        this.accepted = false;
        this.is_done = false;
        this.branch_index = index;
        this.num_steps = -1;

        if (API.config['pushdown'] && !API.stack[this.branch_index]) {
            API.stack[this.branch_index] = API.newStack(this.branch_index);
        }

        if (API.config['tm'] && !API.tapes[this.branch_index]) {
            API.tapes[this.branch_index] = API.newTape(this.branch_index);
        }
    }

    step() {

        let CM = canvasManager.getInstance();
        let SM = simManager.getInstance();

        //check outgoing connections 
        let this_node = CM.nodes[this.current_node_index];
        let connections = this_node.connected_arrows;
        let matches = {
            // state_index -> connection
        };
        this.num_steps++;

        for (let c of connections) {
            if (c.isDeparting(this_node)) {
                continue;
            }

            if (API.config['pushdown']) {
                //first check if we can match the transition against string
                if (c.IF === "" || c.IF === this.string[this.inner_str_index]) {

                    if (c.action === 'pop' && c.OUT !== '') {
                        //need to check against top of stack to see if its a match first 
                        if (API.stack[this.branch_index].last() === c.OUT) {
                            matches[c.end_node.index] = c;
                        } else {
                            continue;
                        }

                    } else if (c.action === 'push' && c.OUT !== '') {
                        matches[c.end_node.index] = c;
                    } else if (c.OUT === '') {
                        matches[c.end_node.index] = c;
                    }

                }

                continue;
            }

            if (c.IF === "") {
                matches[c.end_node.index] = c;
                SM.use_epsilon = true;
            } else if (API.config['tm']) {
                if (c.IF === API.tapes[this.branch_index].read()) {
                    matches[c.end_node.index] = c;
                }
            } else if (c.IF === this.string[this.inner_str_index]) {
                matches[c.end_node.index] = c;
            }
        }

        // console.log(this.branch_index, ' -> ',  Object.keys(matches).length)

        if (Object.keys(matches).length === 1) {
            //deterministic can continue as normal
            CM.nodes[this.current_node_index].is_active = false;
            //only consume input on a literal match, not epsilon
            for (let x in matches) {
                if (API.config['tm']) {
                    if (matches[x].IF === API.tapes[this.branch_index].read()) {
                        this.inner_str_index++;

                        if (matches[x].OUT !== "")
                            API.tapes[this.branch_index].write(matches[x].OUT);
                        API.tapes[this.branch_index].moveLeftRight(matches[x].direction);

                        break;
                    } else if (matches[x].IF === "") {
                        if (matches[x].OUT !== "")
                            API.tapes[this.branch_index].write(matches[x].OUT);
                        API.tapes[this.branch_index].moveLeftRight(matches[x].direction);

                        break;
                    }
                } else if (API.config['pushdown']) {

                    if (matches[x].OUT === API.stack[this.branch_index].last() && matches[x].action === 'pop' && matches[x].OUT !== '') {
                        API.stack[this.branch_index].popSym();
                        if (matches[x].IF !== "") {
                            this.inner_str_index++;
                            if (SM.display_all) {
                                highlightNextChar();
                            }
                        }
                        break;
                    } else if (matches[x].action === 'push' && matches[x].OUT !== '') {
                        API.stack[this.branch_index].pushSym(matches[x].OUT);
                        if (matches[x].IF !== "") {
                            this.inner_str_index++;
                            if (SM.display_all) {
                                highlightNextChar();
                            }
                        }
                        break;
                    } else if (matches[x].OUT === '' && matches[x].IF === this.string[this.inner_str_index]) {
                        if (matches[x].IF !== "") {
                            this.inner_str_index++;
                            if (SM.display_all) {
                                highlightNextChar();
                            }
                        }
                        break;
                    }

                } else if (API.config['dfa'] || API.config['nfa']) {

                    if (matches[x].IF === this.string[this.inner_str_index]) {
                        this.inner_str_index++;
                        if (SM.display_all) {
                            highlightNextChar();
                        }

                        break;
                    }
                    //Do nothing on epsilon, will move to next state automatically
                }
            }

            API.call("node_transition", this.current_node_index, Object.keys(matches)[0], this.inner_str_index);
            this.current_node_index = Object.keys(matches)[0];
            CM.nodes[this.current_node_index].is_active = true;
        } else if (Object.keys(matches).length === 0) {
            //console.log(this.inner_str_index, this.string)
            //nothing more to do, check if we're in an accept state
            if (!API.config['tm']) {
                this.accepted = CM.nodes[this.current_node_index].is_accept &&
                    this.inner_str_index >= this.string.length;
            } else {
                this.accepted = CM.nodes[this.current_node_index].is_accept;
            }
            CM.nodes[this.current_node_index].is_active = false;
            this.is_done = true;
            API.call("branch_complete", this);
        } else if (Object.keys(matches).length > 1) {
            //need to branch on all posibilities
            this.is_deterministic = false;

            if (SM.branches.length === 1) {
                createNewBranch(0);
            }

            let new_inner_str_index = this.inner_str_index;
            let original_stack = API.newStack();
            let original_tape = API.newTape();
            let handle_main = false;
            for (let x in matches) {
                let child_index = this.inner_str_index;
                if (!handle_main) {
                    if (API.config['tm']) {
                        original_tape.mem = JSON.parse(JSON.stringify(API.tapes[this.branch_index].mem));
                        copyTapePrims(API.tapes[this.branch_index], original_tape);

                        if ((matches[x].IF === original_tape.read()) || matches[x].IF === "") {
                            if (matches[x] !== "") {
                                new_inner_str_index++;
                            }
                            if (matches[x].OUT !== "")
                                original_tape.write(matches[x].OUT);
                            original_tape.moveLeftRight(matches[x].direction);
                        }
                    } else if (API.config['pushdown']) {
                        original_stack.stack = JSON.parse(JSON.stringify(API.stack[this.branch_index].stack));
                        if (matches[x].OUT === original_stack.last() && matches[x].action === 'pop' && matches[x].OUT !== '') {
                            original_stack.popSym();
                            new_inner_str_index++;
                        } else if (matches[x].action === 'push' && matches[x].OUT !== '') {
                            original_stack.pushSym(matches[x].OUT);
                            new_inner_str_index++;
                        } else if (matches[x].OUT === '' && matches[x].IF === this.string[this.inner_str_index]) {
                            new_inner_str_index++;
                        }

                    } else if (matches[x].IF === this.string[this.inner_str_index]) {
                        new_inner_str_index++;
                        if (SM.display_all) {
                            highlightNextChar();
                        }
                    }
                    handle_main = true;
                    continue;
                }

                let child_stack = API.newStack();
                let child_tape = API.newTape();
                //only consume input on a literal match, not epsilon
                if (API.config['dfa'] || API.config['nfa']) {
                    if (matches[x].IF === this.string[this.inner_str_index]) {
                        child_index++;
                    }
                } else if (API.config['pushdown']) {
                    //deep copy
                    child_stack.stack = JSON.parse(JSON.stringify(API.stack[this.branch_index].stack));
                    if (matches[x].OUT === original_stack.last() && matches[x].action === 'pop' && matches[x].OUT !== '') {
                        child_stack.popSym();
                        child_index++;
                    } else if (matches[x].action === 'push' && matches[x].OUT !== '') {
                        child_stack.pushSym(matches[x].OUT);
                        child_index++;
                    } else if (matches[x].OUT === '' && matches[x].IF === this.string[this.inner_str_index]) {
                        child_index++;
                    }

                } else if (API.config['tm']) {
                    child_tape.mem = JSON.parse(JSON.stringify(API.tapes[this.branch_index].mem));
                    copyTapePrims(API.tapes[this.branch_index], child_tape);
                    if (matches[x].IF === original_tape.read() || matches[x].IF === "") {
                        if (matches[x].IF !== "") {
                            child_index++;
                        }
                        if (matches[x].OUT !== "")
                            child_tape.write(matches[x].OUT);
                        child_tape.moveLeftRight(matches[x].direction);
                    }
                }

                let index = SM.branches.length;

                CM.nodes[x].is_active = true;
                SM.branches.push(new SimState(x, this.string, index, child_index));

                if (API.config['pushdown']) {
                    copyStack(child_stack, API.stack[index]);
                }

                if (API.config['tm']) {
                    //copy TM to next branch
                    copyTape(child_tape, API.tapes[index]);
                }

                createNewBranch(index);
            }

            //the first match will be followed by the 'main' branch
            CM.nodes[this.current_node_index].is_active = false;
            this.inner_str_index = new_inner_str_index;
            this.current_node_index = Object.keys(matches)[0];
            CM.nodes[this.current_node_index].is_active = true;

            if (API.config['pushdown']) {
                API.stack[this.branch_index] = original_stack;
            }

            if (API.config['tm']) {
                API.tapes[this.branch_index] = original_tape;
            }
        }

    }
}


function createNewBranch(branch_index) {
    let branch_bar = document.getElementById('branches');
    if (!branch_bar) {
        return;
    }

    let SM = simManager.getInstance();

    let new_btn = document.createElement('button');
    new_btn.appendChild(document.createTextNode(`Branch ${branch_index}`));
    new_btn.addEventListener('click', () => {
        displayBranch(branch_index);
    });
    branch_bar.appendChild(new_btn);

    let all_btn = document.getElementById('branch-all')
    all_btn.addEventListener('click', () => {
        SM.display_all = true;
        if (API.config['pushdown']) {
            API.stack[0].renderStack();
        }
    });
    all_btn.style.display = '';
}


function displayBranch(id) {
    let SM = simManager.getInstance();
    SM.display_all = false;
    SM.current_branch_open = id;
    if (!API.config['tm']) {
        highlightChar(SM.getCurrentBranch().inner_str_index - 1);
    }
    if (API.config['pushdown']) {
        API.stack[id].renderStack();
    }

    if (API.config['tm']) {
        API.tapes[id].renderTape();
    }
}


function highlightNextChar() {
    if (API.config['external_input'] || API.config['tm']) {
        return;
    }

    let SM = simManager.getInstance();
    let tgt = document.getElementsByClassName('highlight');

    if (tgt.length === 0) {
        tgt = document.getElementById(`str-${SM.str_index}-0`);
        if (!tgt) {
            return;
        }
        tgt.className += 'highlight';
    } else {
        tgt[0].className = "";
        let branch = SM.branches[SM.current_branch_open];

        tgt = document.getElementById(`str-${SM.str_index}-${branch.inner_str_index}`);
        if (!tgt) {
            return;
        }

        tgt.className += 'highlight';
    }
}


function highlightChar(index) {
    if (index < 0)
        index = 0;
    //console.log(index);
    if (API.config['external_input']) {
        return;
    }

    clearHighLightedChars();

    let SM = simManager.getInstance();
    let tgt = document.getElementById(`str-${SM.str_index}-${index}`);
    // console.log(tgt);
    if (!tgt) {
        return;
    }
    tgt.className = 'highlight';
}


function moveToNextRow() {
    let SM = simManager.getInstance();
    let tgts = document.getElementsByClassName('highlight');
    for (let t of tgts) {
        t.className = "";
    }
    let new_index = SM.str_index + 1;
    //resetSim();
    simManager.clear();
    SM = simManager.getInstance();
    if (API.config['pushdown']) {
        let cpy = API.stack[0];
        API.stack = [cpy];
        API.stack[0].reset();
    }

    SM.str_index = new_index;
    if (API.config['tm']) {
        let cpy = API.tapes[0];
        API.tapes = [cpy];
        API.tapes[0].moveNextRow();
    }

    for (let n of canvasManager.getInstance().nodes) {
        n.is_active = false;
    }

    hideBranches();
}


function updateStatus(status) {
    let SM = simManager.getInstance();
    API.call("update_status", status);
    if (API.config['external_input']) {
        return;
    }

    let actual_tgt = document.getElementById(`actual-${SM.str_index}`);
    if (!actual_tgt) {
        return;
    }


    let className = 'highlight-bad';

    actual_tgt.className += className;
    actual_tgt.innerHTML = status;
}

function step() {
    let SM = simManager.getInstance();
    let CM = canvasManager.getInstance();
    if (!SM.has_started) {

        let string = null;
        if (API.translation_table['request_input']) {
            string = API.call('request_input');
        } else {
            string = getNextString();
        }

        if (CM.nodes.length > 0) {
            SM.branches.push(new SimState(0, string));
            CM.nodes[0].is_active = true;
            SM.has_started = true;
            if (!API.config['tm']) {
                highlightNextChar();
            }
        } else {
            return;
        }

    } else {
        let all_done = true;
        let num_branches = SM.branches.length;
        for (let i = 0; i < num_branches; i++) {
            if (!SM.branches[i].is_done) {
                all_done = false;
                console.log(SM.branches[i]);
                SM.branches[i].step();
            }

            if (SM.branches[i].accepted) {
                updateStatus("Accept");
                moveToNextRow();
                //reset and move to next row
                return;
            }
        }

        if (!SM.display_all && !API.config['tm']) {
            highlightChar(SM.getCurrentBranch().inner_str_index - 1);
        }

        //all done?
        if (all_done) {
            updateStatus("Reject");
            moveToNextRow();
        }
    }
}


function getNextString() {
    let SM = simManager.getInstance();
    let tgt = document.getElementById(`str-${SM.str_index}`);

    if (!tgt) {
        return "";
    }

    return tgt.dataset.fullString;
}

function clearHighLightedChars() {
    let tgts = document.getElementsByClassName('highlight');
    for (let t of tgts) {
        t.className = "";
    }
}


function resetSim() {
    simManager.clear();
    clearTransitionTable();
    API.call("reset_sim");

    for (let n of canvasManager.getInstance().nodes) {
        n.is_active = false;
    }

    clearHighLightedChars();

    let tgts = document.getElementsByClassName('highlight-good');
    for (let t of tgts) {
        t.className = "";
    }

    tgts = document.getElementsByClassName('highlight-bad');
    for (let t of tgts) {
        t.className = "";
    }
    hideBranches();

}

function hideBranches() {
    let tgt = document.getElementById('branches');
    if (!tgt) {
        return;
    }

    tgt.innerHTML = `<button style="display: none;" id="branch-all">All</button>`;
}

function clearTransitionTable() {
    if (API.is_external) {
        return;
    }
    let tgt = document.getElementById('t_table');
    if (!tgt) {
        return;
    }
    tgt.innerHTML =
        `<tr>
            <th> Состояние </th>
            <th> Переход </th>
            <th> Следующее состояние </th>
        </tr>`
}


export {
    getNextString,
    simManager,
    step
}