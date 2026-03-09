// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title AgentPFP
 * @notice NFT collection for AI agent cognitive artifacts. Agents mint via x402.
 *         Reasoning hashes stored on-chain. When collection closes, Merkle root
 *         of all reasoning can be inscribed on Bitcoin.
 */
contract AgentPFP is ERC721, Ownable, ReentrancyGuard {
    uint256 private _nextTokenId;
    uint256 public constant MINT_FEE = 0.001 ether;
    address public treasury;
    address public minter; // Server that mints after x402 payment verified
    bool public collectionClosed;
    bytes32 public merkleRoot;

    mapping(uint256 => bytes32) public tokenReasoningHash;

    event Minted(
        address indexed minter,
        uint256 indexed tokenId,
        bytes32 reasoningHash,
        string model
    );
    event CollectionClosed(bytes32 merkleRoot);
    event TreasuryUpdated(address indexed oldTreasury, address indexed newTreasury);
    event MinterUpdated(address indexed oldMinter, address indexed newMinter);

    error CollectionClosed_();
    error InsufficientPayment();
    error InvalidTreasury();
    error OnlyMinter();

    constructor(
        address _treasury,
        address _initialOwner
    ) ERC721("AgentPFP", "APFP") Ownable(_initialOwner) {
        if (_treasury == address(0)) revert InvalidTreasury();
        treasury = _treasury;
        minter = _initialOwner;
    }

    /**
     * @notice Mint by server after x402 payment verified. Payment goes to treasury off-chain.
     */
    function mintByMinter(
        address to,
        bytes32 reasoningHash,
        string calldata model
    ) external nonReentrant {
        if (msg.sender != minter) revert OnlyMinter();
        if (collectionClosed) revert CollectionClosed_();

        uint256 tokenId = _nextTokenId++;
        tokenReasoningHash[tokenId] = reasoningHash;
        _safeMint(to, tokenId);

        emit Minted(to, tokenId, reasoningHash, model);
    }

    /**
     * @notice Direct mint with ETH (alternative path if not using x402 server).
     */
    function mint(
        address to,
        bytes32 reasoningHash,
        string calldata model
    ) external payable nonReentrant {
        if (collectionClosed) revert CollectionClosed_();
        if (msg.value < MINT_FEE) revert InsufficientPayment();

        (bool sent, ) = treasury.call{value: msg.value}("");
        require(sent, "Transfer failed");

        uint256 tokenId = _nextTokenId++;
        tokenReasoningHash[tokenId] = reasoningHash;
        _safeMint(to, tokenId);

        emit Minted(to, tokenId, reasoningHash, model);
    }

    function setMinter(address _minter) external onlyOwner {
        address old = minter;
        minter = _minter;
        emit MinterUpdated(old, _minter);
    }

    /**
     * @notice Close the collection and set Merkle root for Bitcoin inscription.
     *         Only callable by owner after hashing all agents' reasoning.
     */
    function closeCollection(bytes32 _merkleRoot) external onlyOwner {
        require(!collectionClosed, "Already closed");
        collectionClosed = true;
        merkleRoot = _merkleRoot;
        emit CollectionClosed(_merkleRoot);
    }

    function setTreasury(address _treasury) external onlyOwner {
        if (_treasury == address(0)) revert InvalidTreasury();
        address old = treasury;
        treasury = _treasury;
        emit TreasuryUpdated(old, _treasury);
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        return string.concat(
            "ipfs://QmAgentPFP/",
            _toString(tokenId)
        );
    }

    function _toString(uint256 value) internal pure returns (string memory) {
        if (value == 0) return "0";
        uint256 temp = value;
        uint256 digits;
        while (temp != 0) {
            digits++;
            temp /= 10;
        }
        bytes memory buffer = new bytes(digits);
        while (value != 0) {
            digits -= 1;
            buffer[digits] = bytes1(uint8(48 + uint256(value % 10)));
            value /= 10;
        }
        return string(buffer);
    }
}
