import {
    isEmpty as sharedIsEmpty,
    isNotEmpty as sharedIsNotEmpty,
    isInteger as sharedIsInteger,
    isValidEmail,
    isValidUrl,
} from '../../shared/utils/validation';

export const isEmpty = sharedIsEmpty;
export const isNotEmpty = sharedIsNotEmpty;
export const isInteger = sharedIsInteger;
export const isEmail = isValidEmail;
export const isURL = isValidUrl;
