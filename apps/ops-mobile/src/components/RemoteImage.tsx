import React from 'react';
import {
  Image,
  Platform,
  StyleSheet,
  View,
  type ImageStyle,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

type Props = {
  uri: string;
  style?: StyleProp<ViewStyle>;
  imageStyle?: StyleProp<ImageStyle>;
};

/**
 * RN `Image` on web often fails to paint blob: URLs and percentage-sized photos.
 * Use a real img on web; keep Image on native.
 */
export function RemoteImage({ uri, style, imageStyle }: Props) {
  return (
    <View style={[styles.frame, style]}>
      {Platform.OS === 'web'
        ? React.createElement('img', {
            src: uri,
            alt: '',
            style: {
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              display: 'block',
            },
          })
        : (
            <Image source={{ uri }} style={[styles.image, imageStyle]} resizeMode="cover" />
          )}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { overflow: 'hidden' },
  image: { width: '100%', height: '100%' },
});
