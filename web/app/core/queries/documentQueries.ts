import {API_CONFIG} from '../config/api';
import {apiClient, type RequestOptions} from '../services/apiClient';

/** Documents are shared by every feature that has files (part photos today). */
export const documentQueries = {
  /** A processed variant ("thumb", "display") or the "original". Needs the bearer token, so it is fetched as a blob. */
  getContentAsync: (documentId: string, name: string, options?: RequestOptions) =>
    apiClient.getBlobAsync(`${API_CONFIG.documentsUrl}/v1/documents/${documentId}/content/${name}`, options),
};
