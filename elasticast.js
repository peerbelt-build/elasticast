function numCmp(a,b) {
    if ( a < b ) { return 1; }
    else if ( b === a ) { return 0; }
    else { return -1; }
};
function Audio() {
    var self = this;
    var timer, listener;
    if ( ! ( this instanceof Audio ) ) {
        return new Audio( );
    }
    function notify() {
        self.pause();
        if ( listener ) {
            listener();
        }
    }
    self.src = undefined;
    self.play = function( ) {
        var fragment = podcast && podcast.fragmentIndex[ self.src ];
        if ( !fragment ) {
            return;
        }
        if ( !timer ) {
            timer = window.setTimeout( notify, fragment.length * 100 );
        }
    }
    self.pause = function() {
        if ( timer ) {
            window.clearTimeout( timer );
            timer = undefined;
        }
    }
    self.addEventListener = function( e, l ) {
        listener = l;
    }
    return self;
}

function argNames( fn ) {
    return fn.toString().split( /\(\s*/ )[ 1 ].split( /\s*\)/ )[ 0 ].split( /\s*,\s*/g );
}
function Fragment( audio, length, description, priority, next, external ) {
    var self = this;
    var argN = argNames( Fragment );
    if ( ! ( this instanceof Fragment ) ) {
        return new Fragment( audio, length, description, priority, next, external );
    }
    Array.prototype.slice.apply( arguments ).forEach( (v,i)=>self[ argN[ i ] ]=v );
    if ( !Array.isArray( self.next ) ) {
        if ( self.next ) {
            self.next = [ self.next ];
        } else {
            self.next = [ ];
        }
    }
    return self;
}

function sliceAt( fragmentId ) {
    var self = this;
    var index = self.findIndex( (e)=>{ return e.audio===fragmentId } );
    return self.slice( index + 1 );
}
function Podcast( fragments, playlistChangeListener ) {
    var self = this;
    if ( ! ( this instanceof Podcast ) ) {
        return new Podcast( fragments, playlistChangeListener );
    }
    self.fragmentIndex = { };
    self.playlist = [ ];
    ( self.fragments = fragments.slice( ) ).forEach( (f, i)=>{
        self.playlist[ i ]=f.audio;
        self.fragmentIndex[f.audio]=f; } );
    self.played = 0;
    self._playlistChange = playlistChangeListener;
    self.junction = self._junction.bind( self, "" );
    self.fragments.sliceAt = sliceAt;
    self._external = [ ];
    return self;
}
Podcast.prototype.adjust = function( duration, fragmentPin ) {
    var self = this;
    var priority = 0;
    var currentLength;
    var fragmentMap = [ ], it, f;
    var exiting = false, src, slicing = [], sliced = [];
    duration = duration || 0;
    if ( fragmentPin ) {
        fragmentPin = ( self.fragments[
            self.fragments.findIndex( (e)=>{ return e.audio===fragmentPin } ) - 1 ] || { } ).audio || "_";
    }
    ( src = self.fragments.sliceAt( fragmentPin || self.playing() ) ).forEach( function( f, i ) {
        priority = ( f.priority || 0 );
        fragmentMap[ priority ] = it = ( fragmentMap[ priority ] || [ ] );
        it.push( [ f.audio, i ] ); } );
    currentLength = self.length( false, ( src = src.map( (f)=>{ return f.audio } ) ) );
    if ( duration >= currentLength ) {
        ;
    } else {
        priority = fragmentMap.length - 1;
        while( priority > 0 ) {
            it = fragmentMap[ priority ] || [ ];
            while( f = it.pop() ) {
                currentLength -= ( self.fragmentIndex[ f[ 0 ] || "_" ] || [ ] ).length;
                slicing.push( f[ 1 ] );
                if ( duration >= currentLength ) {
                    exiting = true;
                    break;
                }
            }
            if ( exiting ) {
                break;
            }
            priority--;
        }
    }
    if ( slicing.length && self._playlistChange ) {
        ( slicing.slice().sort( numCmp ) ).forEach( ( i )=>sliced.unshift( src.splice( i, 1 )[ 0 ] ) );
    }
    if ( ( f = self.playlist.join( "," ) ) !== src.join( "," ) ) {
        self.playlist = src;
        if ( self.player && !f ) {
            self.player._continue( );
        }
        self._playlistChange( self, self.playlist, sliced, slicing );
    }
}
Podcast.prototype._junction = function( fragmentId ) {
    var self = this;
    var next = ( ( self.fragmentIndex[ fragmentId ] || { } ).next || [ ] ).slice( );
    var additional = self.playlist[ 0 ];
    var def = 0;
    if ( additional && ( def = next.indexOf( additional ) ) === -1 ) {
        def = 0;
        next.unshift( additional );
    }
    next[ "def" ] = next[ def ];
    return next;
}
Podcast.prototype.playing = function( next ) {
    var self = this;
    return self.player.playing( next );
}
Podcast.prototype.length = function( remaining, source ) {
    var l = 0, self = this;
    ( source || self.playlist ).forEach( ( f )=>( l+= ( ( f && ( f = self.fragmentIndex[ f ] ) &&  f.length ) || 0 )  ) );
    if ( !remaining ) {
        l += self.played; 
    }
    return l;
}
Podcast.prototype._collectExternal = function( next ) {
    var self = this;
    ( next || [ ] ).forEach( ( f )=> {
        if ( ( !self.fragmentIndex[ f ] ) && ( self._external.indexOf( f ) === -1 ) ) {
            self._external.push( f );
        }
    } )
}
Podcast.prototype.external = function() {
    return this._external.slice();
}

function Player( podcast, autoplay, junctionListener ) {
    var self = this;
    if ( ! ( this instanceof Player ) ) {
        return new Player( podcast, autoplay, junctionListener );
    }
    if ( typeof autoplay === "function" ){
        junctionListener = autoplay;
        autoplay = false;
    }
    function increment( playerType ) {
        self[ playerType ] += 1;
        if ( self[ playerType ] >= self._players.length ) {
            self[ playerType ] = 0;
        }
    }
    function continuePlay( beginning ) {
        var podcast = self.podcast;
        var currentPlayer, next;
        self._players[ self._active ].pause();
        if ( self.ending && ( self.ending = !self.preload( ) ) ) {
            if ( junctionListener ) {
                junctionListener( self, undefined, podcast.external() );
            }
            return;
        }
        if ( !beginning ) {
            increment( "_active" );
        }
        podcast.played += ( podcast.fragmentIndex[ ( podcast && podcast.playlist[ 0 ] ) || "_" ] || [] ).length;
        podcast.playlist = podcast.playlist.slice( 1 );
        self._next = self._active;
        increment( "_next" );
        ( currentPlayer = self._players[ self._active ] ).play();
        if ( !self.ending && !self.preload( ) ) {
            self.ending = 1;
        }
        self.podcast._collectExternal(
            next = ( self.podcast.junction =
                     self.podcast._junction.bind(
                        self.podcast, currentPlayer.fragmentId ) )( ) );
        if ( junctionListener ) {
            junctionListener( self,
                currentPlayer.fragmentId, next );
        }
    }
    self._continue = continuePlay;
    self._players = [ Audio(), Audio() ]; 
        // [ document.getElementById( "player1" ), document.getElementById( "player2" ) ];
    self._players.forEach( (a)=>{
        a.volume = 0;
        a.addEventListener( "ended", continuePlay ) } );
    self._active = 0;
    self._next = 1;
    self.podcast = podcast;
    podcast.player = self;
    self.preload( true );
    continuePlay( true );
    if (!autoplay) {
        self.pause();
    }
    return self;
}
Player.prototype.pause = function( ) {
    this._players[ this._active ].pause();
}
Player.prototype.play = function( ) {
    this._players[ this._active ].play();
}
Player.prototype.preload = function( current ) {
    var self = this;
    var podcast = self.podcast;
    var fragmentId = podcast.playlist[ 0 ];
    var fragment = fragmentId && podcast.fragmentIndex[ fragmentId ];
    var player;
    if ( !fragment ) {
        return false;
    } else {
        ( player = self._players[ current ? self._active : self._next ] ).src = fragment.audio;
        player.fragmentId = fragment.audio;
    }
    return true;
}
Player.prototype.playing = function( next ) {
    var self = this;
    return self._players[ !next ? self._active : self._next ].fragmentId;
}