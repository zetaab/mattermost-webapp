// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {connect} from 'react-redux';
import {getConfig} from 'mattermost-redux/selectors/entities/general';

import ErrorPage from './error_page.jsx';

function mapStateToProps(state) {
    const config = getConfig(state);

    return {
        siteName: config.SiteName,
        asymmetricSigningPublicKey: config.AsymmetricSigningPublicKey,
    };
}

export default connect(mapStateToProps)(ErrorPage);
