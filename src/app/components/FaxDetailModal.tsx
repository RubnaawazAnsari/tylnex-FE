import React, { useEffect, useState } from "react";
import { X, RefreshCw } from "lucide-react";

interface FaxDetailModalProps {
  faxId: string | null;
  isOpen: boolean;
  onClose: () => void;
  apiBaseUrl: string;
}

const FaxDetailModal: React.FC<FaxDetailModalProps> = ({
  faxId,
  isOpen,
  onClose,
  apiBaseUrl,
}) => {
  const [fax, setFax] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen && faxId) {
      const fetchFaxDetail = async () => {
        setLoading(true);
        try {
          const res = await fetch(`${apiBaseUrl}/fax/status/${faxId}`);
          const result = await res.json();
          console.log(result)
          if (res.ok && result.data) {
            const d = result.data || {};
            const normalized = {
              id: d.id,
              direction: d.direction,
              from: d.from ?? d.from_number ?? null,
              to: d.to ?? d.to_number ?? null,
              status: d.status,
              quality: d.quality ?? null,
              created_at: d.created_at ?? d.createdAt ?? null,
              updated_at: d.updated_at ?? d.updatedAt ?? d.completedAt ?? null,
              preview_url: d.preview_url ?? null,
              stored_media_url: d.stored_media_url ?? d.mediaUrl ?? null,
            };
            setFax(normalized);
          } else {
            setFax(null);
          }
        } catch (err) {
          console.error("Error fetching fax detail:", err);
          setFax(null);
        } finally {
          setLoading(false);
        }
      };
      fetchFaxDetail();
    } else {
      setFax(null);
    }
  }, [isOpen, faxId, apiBaseUrl]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white rounded-2xl shadow-lg w-full max-w-2xl p-6 relative">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
        >
          <X className="w-6 h-6" />
        </button>

        <h2 className="text-2xl font-bold text-gray-900 mb-4">Fax Details</h2>

        {loading ? (
          <div className="flex items-center justify-center py-10">
            <RefreshCw className="w-6 h-6 animate-spin text-indigo-600" />
            <span className="ml-2 text-gray-600">Loading...</span>
          </div>
        ) : fax ? (
          <>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="font-medium">Fax ID:</span> {fax.id}
              </div>
              <div>
                <span className="font-medium">Direction:</span> {fax.direction}
              </div>
              <div>
                <span className="font-medium">From:</span> {fax.from ?? "-"}
              </div>
              <div>
                <span className="font-medium">To:</span> {fax.to ?? "-"}
              </div>
              <div>
                <span className="font-medium">Status:</span> {fax.status}
              </div>
              <div>
                <span className="font-medium">Quality:</span> {fax.quality ?? "-"}
              </div>
              <div>
                <span className="font-medium">Created At:</span>{" "}
                {fax.created_at ? new Date(fax.created_at).toLocaleString() : "-"}
              </div>
              <div>
                <span className="font-medium">Updated At:</span>{" "}
                {fax.updated_at ? new Date(fax.updated_at).toLocaleString() : "-"}
              </div>
            </div>

            {fax.preview_url && (
              <div className="mt-6">
                <p className="font-medium text-gray-700 mb-2">Preview:</p>
                <img
                  src={fax.preview_url}
                  alt="Fax Preview"
                  className="rounded-lg border max-h-64 mx-auto"
                />
              </div>
            )}

            {fax.stored_media_url && (
              <div className="mt-4">
                <a
                  href={fax.stored_media_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-indigo-600 hover:underline text-sm"
                >
                  Download Document
                </a>
              </div>
            )}
          </>
        ) : (
          <p className="text-gray-500 text-center">
            Failed to load fax details.
          </p>
        )}
      </div>
    </div>
  );
};

export default FaxDetailModal;
