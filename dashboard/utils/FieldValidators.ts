import {
    isEmpty as sharedIsEmpty,
    isValidEmail,
    isValidUrl,
} from '../../shared/utils/validation';

export const isEmpty = sharedIsEmpty;
export const isEmail = isValidEmail;
export const isURL = isValidUrl;
