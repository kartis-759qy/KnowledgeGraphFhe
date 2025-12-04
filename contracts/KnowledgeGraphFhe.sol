// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { FHE, euint32, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract KnowledgeGraphFhe is SepoliaConfig {
    struct EncryptedEntity {
        uint256 id;
        euint32 encryptedType;
        euint32 encryptedAttributes;
        uint256 timestamp;
    }

    struct EncryptedRelation {
        uint256 fromEntity;
        uint256 toEntity;
        euint32 encryptedRelationType;
        euint32 encryptedWeight;
    }

    struct DecryptedEntity {
        string entityType;
        string attributes;
        bool isRevealed;
    }

    uint256 public entityCount;
    mapping(uint256 => EncryptedEntity) public encryptedEntities;
    mapping(uint256 => DecryptedEntity) public decryptedEntities;
    mapping(uint256 => EncryptedRelation[]) public entityRelations;
    
    mapping(string => euint32) private encryptedTypeCounts;
    string[] private typeList;
    
    mapping(uint256 => uint256) private requestToEntityId;
    
    event EntityAdded(uint256 indexed id, uint256 timestamp);
    event RelationAdded(uint256 fromEntity, uint256 toEntity);
    event DecryptionRequested(uint256 indexed id);
    event EntityDecrypted(uint256 indexed id);
    
    modifier onlyContributor() {
        _;
    }

    function addEncryptedEntity(
        euint32 encryptedType,
        euint32 encryptedAttributes
    ) public onlyContributor {
        entityCount += 1;
        uint256 newId = entityCount;
        
        encryptedEntities[newId] = EncryptedEntity({
            id: newId,
            encryptedType: encryptedType,
            encryptedAttributes: encryptedAttributes,
            timestamp: block.timestamp
        });
        
        decryptedEntities[newId] = DecryptedEntity({
            entityType: "",
            attributes: "",
            isRevealed: false
        });
        
        emit EntityAdded(newId, block.timestamp);
    }

    function addEncryptedRelation(
        uint256 fromEntity,
        uint256 toEntity,
        euint32 encryptedRelationType,
        euint32 encryptedWeight
    ) public onlyContributor {
        entityRelations[fromEntity].push(EncryptedRelation({
            fromEntity: fromEntity,
            toEntity: toEntity,
            encryptedRelationType: encryptedRelationType,
            encryptedWeight: encryptedWeight
        }));
        
        emit RelationAdded(fromEntity, toEntity);
    }

    function requestEntityDecryption(uint256 entityId) public onlyContributor {
        EncryptedEntity storage entity = encryptedEntities[entityId];
        require(!decryptedEntities[entityId].isRevealed, "Already decrypted");
        
        bytes32[] memory ciphertexts = new bytes32[](2);
        ciphertexts[0] = FHE.toBytes32(entity.encryptedType);
        ciphertexts[1] = FHE.toBytes32(entity.encryptedAttributes);
        
        uint256 reqId = FHE.requestDecryption(ciphertexts, this.decryptEntity.selector);
        requestToEntityId[reqId] = entityId;
        
        emit DecryptionRequested(entityId);
    }

    function decryptEntity(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) public {
        uint256 entityId = requestToEntityId[requestId];
        require(entityId != 0, "Invalid request");
        
        EncryptedEntity storage eEntity = encryptedEntities[entityId];
        DecryptedEntity storage dEntity = decryptedEntities[entityId];
        require(!dEntity.isRevealed, "Already decrypted");
        
        FHE.checkSignatures(requestId, cleartexts, proof);
        
        (string memory entityType, string memory attributes) = abi.decode(cleartexts, (string, string));
        
        dEntity.entityType = entityType;
        dEntity.attributes = attributes;
        dEntity.isRevealed = true;
        
        if (FHE.isInitialized(encryptedTypeCounts[dEntity.entityType]) == false) {
            encryptedTypeCounts[dEntity.entityType] = FHE.asEuint32(0);
            typeList.push(dEntity.entityType);
        }
        encryptedTypeCounts[dEntity.entityType] = FHE.add(
            encryptedTypeCounts[dEntity.entityType],
            FHE.asEuint32(1)
        );
        
        emit EntityDecrypted(entityId);
    }

    function queryEncryptedRelations(uint256 entityId) public view returns (EncryptedRelation[] memory) {
        return entityRelations[entityId];
    }

    function getDecryptedEntity(uint256 entityId) public view returns (
        string memory entityType,
        string memory attributes,
        bool isRevealed
    ) {
        DecryptedEntity storage e = decryptedEntities[entityId];
        return (e.entityType, e.attributes, e.isRevealed);
    }

    function getEntityCount() public view returns (uint256) {
        return entityCount;
    }
}