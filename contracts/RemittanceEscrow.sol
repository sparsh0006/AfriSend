// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract RemittanceEscrow {

    struct Transfer {
        address sender;
        address recipient;
        uint256 amount;
        bool claimed;
        bool cancelled;
    }

    IERC20 public usdt;
    uint256 public nextId;
    mapping(uint256 => Transfer) public transfers;

    event Sent(uint256 id, address sender, address recipient, uint256 amount);
    event Claimed(uint256 id);
    event Cancelled(uint256 id);

    constructor(address _usdt) {
        usdt = IERC20(_usdt);
    }

    function send(address recipient, uint256 amount) external returns (uint256) {
        require(amount > 0, "Amount must be > 0");
        usdt.transferFrom(msg.sender, address(this), amount);
        uint256 id = nextId++;
        transfers[id] = Transfer(msg.sender, recipient, amount, false, false);
        emit Sent(id, msg.sender, recipient, amount);
        return id;
    }

    function claim(uint256 id) external {
        Transfer storage t = transfers[id];
        require(msg.sender == t.recipient, "Not recipient");
        require(!t.claimed && !t.cancelled, "Not claimable");
        t.claimed = true;
        usdt.transfer(t.recipient, t.amount);
        emit Claimed(id);
    }

    function cancel(uint256 id) external {
        Transfer storage t = transfers[id];
        require(msg.sender == t.sender, "Not sender");
        require(!t.claimed && !t.cancelled, "Not cancellable");
        t.cancelled = true;
        usdt.transfer(t.sender, t.amount);
        emit Cancelled(id);
    }
}