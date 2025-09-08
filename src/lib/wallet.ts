// src/lib/wallet.ts
export const getVendorWalletAddress = async (): Promise<string> => {
  if (typeof window !== "undefined" && (window as any).ethereum) {
    try {
      const accounts = await (window as any).ethereum.request({ 
        method: "eth_requestAccounts" 
      });
      return accounts[0];
    } catch (error) {
      console.error("Error connecting wallet:", error);
      throw new Error("Please connect your wallet to access the vendor dashboard.");
    }
  }
  
  const storedAddress = localStorage.getItem("vendorWalletAddress");
  if (storedAddress) {
    return storedAddress;
  }
  
  throw new Error("No wallet detected. Please install MetaMask or connect your wallet.");
};

export const connectWallet = async (): Promise<string> => {
  if (typeof window !== "undefined" && (window as any).ethereum) {
    const accounts = await (window as any).ethereum.request({ 
      method: "eth_requestAccounts" 
    });
    localStorage.setItem("vendorWalletAddress", accounts[0]);
    return accounts[0];
  }
  throw new Error("MetaMask not installed");
};
