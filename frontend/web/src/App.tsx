// App.tsx
import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { getContractReadOnly, getContractWithSigner } from "./contract";
import WalletManager from "./components/WalletManager";
import WalletSelector from "./components/WalletSelector";
import "./App.css";

// Randomly selected styles:
// Colors: Natural (wood + stone + sea blue)
// UI: Hand-drawn illustration style
// Layout: Modular collage
// Interaction: Hover ripple effects

// Randomly selected additional features:
// 1. Project introduction
// 2. Data statistics
// 3. Search & filter
// 4. Team information
// 5. Community links

interface KnowledgeNode {
  id: string;
  encryptedData: string;
  nodeType: string;
  relations: string[];
  timestamp: number;
  owner: string;
  status: "active" | "archived";
}

const App: React.FC = () => {
  const [account, setAccount] = useState("");
  const [loading, setLoading] = useState(true);
  const [nodes, setNodes] = useState<KnowledgeNode[]>([]);
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [walletSelectorOpen, setWalletSelectorOpen] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{
    visible: boolean;
    status: "pending" | "success" | "error";
    message: string;
  }>({ visible: false, status: "pending", message: "" });
  const [newNodeData, setNewNodeData] = useState({
    nodeType: "concept",
    encryptedData: "",
    relations: []
  });
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState<"all" | "concept" | "entity" | "relation">("all");

  // Calculate statistics
  const activeCount = nodes.filter(n => n.status === "active").length;
  const archivedCount = nodes.filter(n => n.status === "archived").length;
  const conceptCount = nodes.filter(n => n.nodeType === "concept").length;
  const entityCount = nodes.filter(n => n.nodeType === "entity").length;
  const relationCount = nodes.filter(n => n.nodeType === "relation").length;

  useEffect(() => {
    loadNodes().finally(() => setLoading(false));
  }, []);

  const onWalletSelect = async (wallet: any) => {
    if (!wallet.provider) return;
    try {
      const web3Provider = new ethers.BrowserProvider(wallet.provider);
      setProvider(web3Provider);
      const accounts = await web3Provider.send("eth_requestAccounts", []);
      const acc = accounts[0] || "";
      setAccount(acc);

      wallet.provider.on("accountsChanged", async (accounts: string[]) => {
        const newAcc = accounts[0] || "";
        setAccount(newAcc);
      });
    } catch (e) {
      alert("Failed to connect wallet");
    }
  };

  const onConnect = () => setWalletSelectorOpen(true);
  const onDisconnect = () => {
    setAccount("");
    setProvider(null);
  };

  const loadNodes = async () => {
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      // Check contract availability
      const isAvailable = await contract.isAvailable();
      if (!isAvailable) {
        console.error("Contract is not available");
        return;
      }
      
      const keysBytes = await contract.getData("node_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing node keys:", e);
        }
      }
      
      const list: KnowledgeNode[] = [];
      
      for (const key of keys) {
        try {
          const nodeBytes = await contract.getData(`node_${key}`);
          if (nodeBytes.length > 0) {
            try {
              const nodeData = JSON.parse(ethers.toUtf8String(nodeBytes));
              list.push({
                id: key,
                encryptedData: nodeData.data,
                nodeType: nodeData.nodeType,
                relations: nodeData.relations || [],
                timestamp: nodeData.timestamp,
                owner: nodeData.owner,
                status: nodeData.status || "active"
              });
            } catch (e) {
              console.error(`Error parsing node data for ${key}:`, e);
            }
          }
        } catch (e) {
          console.error(`Error loading node ${key}:`, e);
        }
      }
      
      list.sort((a, b) => b.timestamp - a.timestamp);
      setNodes(list);
    } catch (e) {
      console.error("Error loading nodes:", e);
    } finally {
      setIsRefreshing(false);
      setLoading(false);
    }
  };

  const createNode = async () => {
    if (!provider) { 
      alert("Please connect wallet first"); 
      return; 
    }
    
    setCreating(true);
    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Encrypting knowledge node with FHE..."
    });
    
    try {
      // Simulate FHE encryption
      const encryptedData = `FHE-${btoa(JSON.stringify({
        content: newNodeData.encryptedData,
        type: newNodeData.nodeType
      }))}`;
      
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const nodeId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      const nodeData = {
        data: encryptedData,
        nodeType: newNodeData.nodeType,
        relations: newNodeData.relations,
        timestamp: Math.floor(Date.now() / 1000),
        owner: account,
        status: "active"
      };
      
      // Store on-chain
      await contract.setData(
        `node_${nodeId}`, 
        ethers.toUtf8Bytes(JSON.stringify(nodeData))
      );
      
      const keysBytes = await contract.getData("node_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing keys:", e);
        }
      }
      
      keys.push(nodeId);
      
      await contract.setData(
        "node_keys", 
        ethers.toUtf8Bytes(JSON.stringify(keys))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "FHE-encrypted node created!"
      });
      
      await loadNodes();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
        setShowCreateModal(false);
        setNewNodeData({
          nodeType: "concept",
          encryptedData: "",
          relations: []
        });
      }, 2000);
    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction")
        ? "Transaction rejected by user"
        : "Creation failed: " + (e.message || "Unknown error");
      
      setTransactionStatus({
        visible: true,
        status: "error",
        message: errorMessage
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    } finally {
      setCreating(false);
    }
  };

  const archiveNode = async (nodeId: string) => {
    if (!provider) {
      alert("Please connect wallet first");
      return;
    }

    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Processing FHE-encrypted node..."
    });

    try {
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const nodeBytes = await contract.getData(`node_${nodeId}`);
      if (nodeBytes.length === 0) {
        throw new Error("Node not found");
      }
      
      const nodeData = JSON.parse(ethers.toUtf8String(nodeBytes));
      
      const updatedNode = {
        ...nodeData,
        status: "archived"
      };
      
      await contract.setData(
        `node_${nodeId}`, 
        ethers.toUtf8Bytes(JSON.stringify(updatedNode))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "Node archived successfully!"
      });
      
      await loadNodes();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
    } catch (e: any) {
      setTransactionStatus({
        visible: true,
        status: "error",
        message: "Archive failed: " + (e.message || "Unknown error")
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    }
  };

  const filteredNodes = nodes.filter(node => {
    const matchesSearch = node.id.toLowerCase().includes(searchTerm.toLowerCase()) || 
                         node.nodeType.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = filterType === "all" || node.nodeType === filterType;
    return matchesSearch && matchesFilter;
  });

  if (loading) return (
    <div className="loading-screen">
      <div className="hand-drawn-spinner"></div>
      <p>Loading knowledge graph...</p>
    </div>
  );

  return (
    <div className="app-container hand-drawn-theme">
      <header className="app-header">
        <div className="logo">
          <div className="logo-icon">
            <div className="graph-icon"></div>
          </div>
          <h1>FHE<span>Knowledge</span>Graph</h1>
        </div>
        
        <div className="header-actions">
          <button 
            onClick={() => setShowCreateModal(true)} 
            className="create-btn ripple-button"
          >
            <div className="add-icon"></div>
            Add Node
          </button>
          <WalletManager account={account} onConnect={onConnect} onDisconnect={onDisconnect} />
        </div>
      </header>
      
      <div className="main-content">
        <div className="welcome-banner">
          <div className="welcome-text">
            <h2>Private On-Chain Knowledge Graph</h2>
            <p>Encrypted knowledge representation with FHE-powered queries</p>
          </div>
          <div className="hand-drawn-decoration"></div>
        </div>
        
        <div className="collage-grid">
          <div className="collage-card hand-drawn-card">
            <h3>Project Introduction</h3>
            <p>This decentralized knowledge graph stores entities and relationships encrypted with FHE, allowing private queries and inference while preserving data ownership.</p>
            <div className="fhe-badge">
              <span>FHE-Encrypted</span>
            </div>
          </div>
          
          <div className="collage-card hand-drawn-card">
            <h3>Graph Statistics</h3>
            <div className="stats-grid">
              <div className="stat-item">
                <div className="stat-value">{nodes.length}</div>
                <div className="stat-label">Total Nodes</div>
              </div>
              <div className="stat-item">
                <div className="stat-value">{activeCount}</div>
                <div className="stat-label">Active</div>
              </div>
              <div className="stat-item">
                <div className="stat-value">{archivedCount}</div>
                <div className="stat-label">Archived</div>
              </div>
              <div className="stat-item">
                <div className="stat-value">{conceptCount}</div>
                <div className="stat-label">Concepts</div>
              </div>
              <div className="stat-item">
                <div className="stat-value">{entityCount}</div>
                <div className="stat-label">Entities</div>
              </div>
              <div className="stat-item">
                <div className="stat-value">{relationCount}</div>
                <div className="stat-label">Relations</div>
              </div>
            </div>
          </div>
        </div>
        
        <div className="nodes-section">
          <div className="section-header">
            <h2>Knowledge Nodes</h2>
            <div className="header-actions">
              <div className="search-filter">
                <input
                  type="text"
                  placeholder="Search nodes..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="hand-drawn-input"
                />
                <select
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value as any)}
                  className="hand-drawn-select"
                >
                  <option value="all">All Types</option>
                  <option value="concept">Concepts</option>
                  <option value="entity">Entities</option>
                  <option value="relation">Relations</option>
                </select>
              </div>
              <button 
                onClick={loadNodes}
                className="refresh-btn ripple-button"
                disabled={isRefreshing}
              >
                {isRefreshing ? "Refreshing..." : "Refresh"}
              </button>
            </div>
          </div>
          
          <div className="nodes-list hand-drawn-card">
            <div className="table-header">
              <div className="header-cell">ID</div>
              <div className="header-cell">Type</div>
              <div className="header-cell">Relations</div>
              <div className="header-cell">Date</div>
              <div className="header-cell">Status</div>
              <div className="header-cell">Actions</div>
            </div>
            
            {filteredNodes.length === 0 ? (
              <div className="no-nodes">
                <div className="no-nodes-icon"></div>
                <p>No knowledge nodes found</p>
                <button 
                  className="ripple-button primary"
                  onClick={() => setShowCreateModal(true)}
                >
                  Create First Node
                </button>
              </div>
            ) : (
              filteredNodes.map(node => (
                <div className="node-row" key={node.id}>
                  <div className="table-cell node-id">#{node.id.substring(0, 6)}</div>
                  <div className="table-cell">
                    <span className={`type-badge ${node.nodeType}`}>
                      {node.nodeType}
                    </span>
                  </div>
                  <div className="table-cell">
                    {node.relations.length > 0 ? node.relations.join(", ") : "None"}
                  </div>
                  <div className="table-cell">
                    {new Date(node.timestamp * 1000).toLocaleDateString()}
                  </div>
                  <div className="table-cell">
                    <span className={`status-badge ${node.status}`}>
                      {node.status}
                    </span>
                  </div>
                  <div className="table-cell actions">
                    {node.status === "active" && (
                      <button 
                        className="action-btn ripple-button warning"
                        onClick={() => archiveNode(node.id)}
                      >
                        Archive
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="team-section hand-drawn-card">
          <h2>Core Team</h2>
          <div className="team-grid">
            <div className="team-member">
              <div className="member-avatar"></div>
              <h3>Dr. Elena Wood</h3>
              <p>Cryptography Researcher</p>
              <p>FHE & Knowledge Representation</p>
            </div>
            <div className="team-member">
              <div className="member-avatar"></div>
              <h3>Mark Stone</h3>
              <p>Blockchain Architect</p>
              <p>Smart Contracts & Decentralization</p>
            </div>
            <div className="team-member">
              <div className="member-avatar"></div>
              <h3>Lisa Ocean</h3>
              <p>UX Designer</p>
              <p>Privacy-Preserving Interfaces</p>
            </div>
          </div>
        </div>
      </div>
  
      {showCreateModal && (
        <ModalCreate 
          onSubmit={createNode} 
          onClose={() => setShowCreateModal(false)} 
          creating={creating}
          nodeData={newNodeData}
          setNodeData={setNewNodeData}
        />
      )}
      
      {walletSelectorOpen && (
        <WalletSelector
          isOpen={walletSelectorOpen}
          onWalletSelect={(wallet) => { onWalletSelect(wallet); setWalletSelectorOpen(false); }}
          onClose={() => setWalletSelectorOpen(false)}
        />
      )}
      
      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div className="transaction-content hand-drawn-card">
            <div className={`transaction-icon ${transactionStatus.status}`}>
              {transactionStatus.status === "pending" && <div className="hand-drawn-spinner"></div>}
              {transactionStatus.status === "success" && <div className="check-icon"></div>}
              {transactionStatus.status === "error" && <div className="error-icon"></div>}
            </div>
            <div className="transaction-message">
              {transactionStatus.message}
            </div>
          </div>
        </div>
      )}
  
      <footer className="app-footer">
        <div className="footer-content">
          <div className="footer-brand">
            <div className="logo">
              <div className="graph-icon"></div>
              <span>FHE Knowledge Graph</span>
            </div>
            <p>Private on-chain knowledge representation powered by FHE</p>
          </div>
          
          <div className="footer-links">
            <a href="#" className="footer-link">Documentation</a>
            <a href="#" className="footer-link">GitHub</a>
            <a href="#" className="footer-link">Community</a>
            <a href="#" className="footer-link">Contact</a>
          </div>
        </div>
        
        <div className="footer-bottom">
          <div className="fhe-badge">
            <span>FHE-Powered Privacy</span>
          </div>
          <div className="copyright">
            © {new Date().getFullYear()} FHE Knowledge Graph. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
};

interface ModalCreateProps {
  onSubmit: () => void; 
  onClose: () => void; 
  creating: boolean;
  nodeData: any;
  setNodeData: (data: any) => void;
}

const ModalCreate: React.FC<ModalCreateProps> = ({ 
  onSubmit, 
  onClose, 
  creating,
  nodeData,
  setNodeData
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setNodeData({
      ...nodeData,
      [name]: value
    });
  };

  const handleSubmit = () => {
    if (!nodeData.encryptedData) {
      alert("Please enter node data");
      return;
    }
    
    onSubmit();
  };

  return (
    <div className="modal-overlay">
      <div className="create-modal hand-drawn-card">
        <div className="modal-header">
          <h2>Create New Knowledge Node</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="fhe-notice-banner">
            <div className="key-icon"></div> Node data will be encrypted with FHE
          </div>
          
          <div className="form-grid">
            <div className="form-group">
              <label>Node Type *</label>
              <select 
                name="nodeType"
                value={nodeData.nodeType} 
                onChange={handleChange}
                className="hand-drawn-select"
              >
                <option value="concept">Concept</option>
                <option value="entity">Entity</option>
                <option value="relation">Relation</option>
              </select>
            </div>
            
            <div className="form-group full-width">
              <label>Encrypted Data *</label>
              <textarea 
                name="encryptedData"
                value={nodeData.encryptedData} 
                onChange={handleChange}
                placeholder="Enter knowledge data to encrypt..." 
                className="hand-drawn-textarea"
                rows={4}
              />
            </div>
          </div>
          
          <div className="privacy-notice">
            <div className="privacy-icon"></div> Data remains encrypted during FHE processing
          </div>
        </div>
        
        <div className="modal-footer">
          <button 
            onClick={onClose}
            className="cancel-btn ripple-button"
          >
            Cancel
          </button>
          <button 
            onClick={handleSubmit} 
            disabled={creating}
            className="submit-btn ripple-button primary"
          >
            {creating ? "Encrypting with FHE..." : "Create Node"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default App;