"use client";

import React, { useState, useEffect, ChangeEvent } from "react";
import {
  Send,
  FileText,
  Phone,
  Clock,
  CheckCircle,
  XCircle,
  RefreshCw,
  Upload,
  Eye,
} from "lucide-react";
import FaxDetailModal from "./FaxDetailModal";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_BE_BASE_URL || "http://localhost:3003";
console.log("API_BASE_URL:", API_BASE_URL);

// Type definitions
interface SendForm {
  to: string;
  from: string;
  mediaUrl: string;
  file: File | null;
}

interface FaxStatus {
  id: string;
  status: string;
  direction: string;
  created_at: string;
  completed_at?: string;
  page_count?: number;
  failure_reason?: string;
  to?: string;
  from?: string;
  preview_url?: string;
  stored_media_url?: string;
  updated_at?: string;
  quality?: string;
}

interface Fax {
  id: string;
  status: string;
  direction: "inbound" | "outbound";
  created_at: string;
  to?: string;
  from?: string;
  failure_reason?: string;
}

interface ApiResponse<T = any> {
  data?: T;
  message?: string;
}

type TabType = "send" | "status" | "history";
type FaxStatusType = "delivered" | "failed" | "sending" | "queued" | string;

const FaxApp: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>("send");
  const [faxes, setFaxes] = useState<Fax[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [sendingFax, setSendingFax] = useState<boolean>(false);

  // Modal state
  const [selectedFaxId, setSelectedFaxId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState<boolean>(false);

  // Send fax form state
  const [sendForm, setSendForm] = useState<SendForm>({
    to: "",
    from: "",
    mediaUrl: "",
    file: null,
  });

  // Status check state
  const [statusFaxId, setStatusFaxId] = useState<string>("");
  const [faxStatus, setFaxStatus] = useState<FaxStatus | null>(null);

  const sendFax = async (): Promise<void> => {
    if (!sendForm.to || !sendForm.mediaUrl) {
      alert("Please fill in all required fields");
      return;
    }

    setSendingFax(true);
    try {
      const response = await fetch(`${API_BASE_URL}/fax/send`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          to: sendForm.to,
          mediaUrl: sendForm.mediaUrl,
          from: sendForm.from || undefined,
        }),
      });

      const result: ApiResponse<{ faxId: string }> = await response.json();

      if (response.ok && result.data) {
        alert(`Fax sent successfully! Fax ID: ${result.data.faxId}`);
        setSendForm({ to: "", from: "", mediaUrl: "", file: null });
        if (activeTab === "history") {
          fetchFaxes();
        }
      } else {
        alert(`Error: ${result.message || "Failed to send fax"}`);
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error occurred";
      alert(`Error: ${errorMessage}`);
    } finally {
      setSendingFax(false);
    }
  };

  const checkFaxStatus = async (): Promise<void> => {
    if (!statusFaxId) {
      alert("Please enter a Fax ID");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/fax/status/${statusFaxId}`);
      const result: ApiResponse<FaxStatus> = await response.json();

      if (response.ok && result.data) {
        setFaxStatus(result.data);
      } else {
        alert(`Error: ${result.message || "Failed to get fax status"}`);
        setFaxStatus(null);
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error occurred";
      alert(`Error: ${errorMessage}`);
      setFaxStatus(null);
    } finally {
      setLoading(false);
    }
  };

  const fetchFaxes = async (): Promise<void> => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/fax/list`);
      const result: ApiResponse<{ data: Fax[] }> = await response.json();

      if (response.ok && result.data) {
        setFaxes(result.data.data || []);
      } else {
        console.error("Failed to fetch faxes:", result.message);
      }
    } catch (error) {
      console.error("Error fetching faxes:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === "history") {
      fetchFaxes();
    }
  }, [activeTab]);

  const getStatusIcon = (status: FaxStatusType): React.ReactElement => {
    switch (status?.toLowerCase()) {
      case "delivered":
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case "failed":
        return <XCircle className="w-5 h-5 text-red-500" />;
      case "sending":
      case "queued":
        return <Clock className="w-5 h-5 text-yellow-500" />;
      default:
        return <Clock className="w-5 h-5 text-gray-500" />;
    }
  };

  const getStatusColor = (status: FaxStatusType): string => {
    switch (status?.toLowerCase()) {
      case "delivered":
        return "text-green-600 bg-green-50 border-green-200";
      case "failed":
        return "text-red-600 bg-red-50 border-red-200";
      case "sending":
      case "queued":
        return "text-yellow-600 bg-yellow-50 border-yellow-200";
      default:
        return "text-gray-600 bg-gray-50 border-gray-200";
    }
  };

  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleString();
  };

  const handleFileUpload = (event: ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0];
    if (file) {
      setSendForm((prev) => ({
        ...prev,
        file: file,
        mediaUrl: URL.createObjectURL(file),
      }));
    }
  };

  const handleFormInputChange =
    (field: keyof Omit<SendForm, "file">) =>
    (event: ChangeEvent<HTMLInputElement>): void => {
      setSendForm((prev) => ({ ...prev, [field]: event.target.value }));
    };

  const renderTabButton = (
    tabId: TabType,
    icon: React.ReactElement,
    label: string
  ): React.ReactElement => (
    <button
      onClick={() => setActiveTab(tabId)}
      className={`flex-1 px-6 py-4 text-lg font-medium transition-all duration-200 ${
        activeTab === tabId
          ? "text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50"
          : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
      }`}
    >
      <span className="inline-block mr-2">{icon}</span>
      {label}
    </button>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 text-black to-indigo-100 w-full">
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="flex items-center justify-center mb-4">
              <FileText className="w-12 h-12 text-indigo-600 mr-3" />
              <h1 className="text-4xl font-bold text-gray-900">
                Telnyx Fax Manager
              </h1>
            </div>
            <p className="text-gray-600 text-lg">
              Send, track, and manage your faxes with ease
            </p>
          </div>

          {/* Navigation Tabs */}
          <div className="bg-white rounded-lg shadow-lg border border-black mb-6">
            <div className="flex border-b">
              {renderTabButton("send", <Send className="w-5 h-5" />, "Send Fax")}
              {renderTabButton("status", <Eye className="w-5 h-5" />, "Check Status")}
              {renderTabButton("history", <FileText className="w-5 h-5" />, "Fax History")}
            </div>

            <div className="p-6">
              {/* Send Fax Tab */}
              {activeTab === "send" && (
                <div className="space-y-6">
                  <h2 className="text-2xl font-bold text-gray-900">Send Fax</h2>
                  
                  <div className="grid grid-cols-2 md:grid-cols-1 gap-6">
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          To Number <span className="text-red-500">*</span>
                        </label>
                        <div className="relative">
                          <Phone className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                          <input
                            type="tel"
                            value={sendForm.to}
                            onChange={handleFormInputChange("to")}
                            placeholder="+1234567890"
                            className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                          />
                        </div>
                      </div>

                      {/* <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          From Number
                        </label>
                        <div className="relative">
                          <Phone className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                          <input
                            type="tel"
                            value={sendForm.from}
                            onChange={handleFormInputChange("from")}
                            placeholder="+1234567890"
                            className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                          />
                        </div>
                      </div> */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Media URL <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="url"
                          value={sendForm.mediaUrl}
                          onChange={handleFormInputChange("mediaUrl")}
                          placeholder="https://example.com/document.pdf"
                          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                        />
                      </div>
                    </div>

                    <div className="space-y-4">
                      

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Upload File
                        </label>
                        <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-indigo-400 transition-colors">
                          <input
                            type="file"
                            onChange={handleFileUpload}
                            className="hidden"
                            id="file-upload"
                            accept=".pdf,.tiff,.tif,.jpg,.jpeg,.png"
                          />
                          <label htmlFor="file-upload" className="cursor-pointer">
                            <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                            <span className="text-gray-600">Click to upload or drag and drop</span>
                            <p className="text-sm text-gray-500 mt-1">PDF, TIFF, JPG, PNG (Max: 10MB)</p>
                          </label>
                        </div>
                        {sendForm.file && (
                          <p className="text-sm text-green-600 mt-2">
                            File selected: {sendForm.file.name}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={sendFax}
                    disabled={sendingFax}
                    className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white py-3 px-6 rounded-lg transition-all duration-200 font-medium flex items-center justify-center"
                  >
                    {sendingFax ? (
                      <RefreshCw className="w-5 h-5 animate-spin mr-2" />
                    ) : (
                      <Send className="w-5 h-5 mr-2" />
                    )}
                    {sendingFax ? "Sending Fax..." : "Send Fax"}
                  </button>
                </div>
              )}

              {/* Status Tab */}
              {activeTab === "status" && (
                <div className="space-y-6">
                  <h2 className="text-2xl font-bold text-gray-900">Check Fax Status</h2>
                  
                  <div className="flex space-x-4">
                    <input
                      type="text"
                      value={statusFaxId}
                      onChange={(e) => setStatusFaxId(e.target.value)}
                      placeholder="Enter Fax ID"
                      className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    />
                    <button
                      onClick={checkFaxStatus}
                      disabled={loading}
                      className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white px-6 py-3 rounded-lg transition-all duration-200 flex items-center"
                    >
                      {loading ? (
                        <RefreshCw className="w-5 h-5 animate-spin mr-2" />
                      ) : (
                        <Eye className="w-5 h-5 mr-2" />
                      )}
                      Check Status
                    </button>
                  </div>

                  {faxStatus && (
                    <div className="bg-white border border-gray-200 rounded-lg p-6">
                      <h3 className="text-lg font-semibold mb-4">Fax Status Details</h3>
                      <div className="grid md:grid-cols-2 gap-4 text-sm">
                        <div><span className="font-medium">ID:</span> {faxStatus.id}</div>
                        <div><span className="font-medium">Status:</span> {faxStatus.status}</div>
                        <div><span className="font-medium">Direction:</span> {faxStatus.direction}</div>
                        <div><span className="font-medium">To:</span> {faxStatus.to}</div>
                        <div><span className="font-medium">From:</span> {faxStatus.from}</div>
                        <div><span className="font-medium">Created:</span> {formatDate(faxStatus.created_at)}</div>
                        {faxStatus.completed_at && (
                          <div><span className="font-medium">Completed:</span> {formatDate(faxStatus.completed_at)}</div>
                        )}
                        {faxStatus.page_count && (
                          <div><span className="font-medium">Pages:</span> {faxStatus.page_count}</div>
                        )}
                        {faxStatus.failure_reason && (
                          <div className="md:col-span-2">
                            <span className="font-medium">Failure Reason:</span> {faxStatus.failure_reason}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* History Tab */}
              {activeTab === "history" && (
                <div className="space-y-6">
                  <div className="flex justify-between items-center">
                    <h2 className="text-2xl font-bold text-gray-900">Fax History</h2>
                    <button
                      onClick={fetchFaxes}
                      disabled={loading}
                      className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white px-4 py-2 rounded-lg transition-all duration-200 flex items-center"
                    >
                      {loading ? (
                        <RefreshCw className="w-4 h-4 animate-spin mr-2" />
                      ) : (
                        <RefreshCw className="w-4 h-4 mr-2" />
                      )}
                      Refresh
                    </button>
                  </div>

                  {loading ? (
                    <div className="flex items-center justify-center py-8">
                      <RefreshCw className="w-8 h-8 animate-spin text-indigo-600" />
                      <span className="ml-2 text-gray-600">Loading faxes...</span>
                    </div>
                  ) : faxes.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">No faxes found</div>
                  ) : (
                    <div className="space-y-4">
                      {faxes.map((fax) => (
                        <div
                          key={fax.id}
                          onClick={() => {
                            setSelectedFaxId(fax.id);
                            setModalOpen(true);
                          }}
                          className="cursor-pointer bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow duration-200"
                        >
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center space-x-3">
                              {getStatusIcon(fax.status)}
                              <span className="font-medium text-gray-900">
                                {fax.direction === "outbound"
                                  ? `To: ${fax.to}`
                                  : `From: ${fax.from}`}
                              </span>
                            </div>
                            <div
                              className={`px-3 py-1 rounded-full text-sm font-medium border ${getStatusColor(
                                fax.status
                              )}`}
                            >
                              {fax.status}
                            </div>
                          </div>

                          <div className="grid md:grid-cols-3 gap-4 text-sm text-gray-600">
                            <div>
                              <span className="font-medium">ID:</span> {fax.id.substring(0, 8)}...
                            </div>
                            <div>
                              <span className="font-medium">Created:</span> {formatDate(fax.created_at)}
                            </div>
                            <div>
                              <span className="font-medium">Direction:</span> {fax.direction}
                            </div>
                          </div>

                          {fax.failure_reason && (
                            <div className="mt-2 text-sm text-red-600">
                              <span className="font-medium">Error:</span> {fax.failure_reason}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Global Modal */}
      <FaxDetailModal
        faxId={selectedFaxId}
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        apiBaseUrl={API_BASE_URL}
      />
    </div>
  );
};

export default FaxApp;