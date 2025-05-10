//go:build js && wasm

package app

import (
	"crypto/elliptic"
	_ "embed"
	"fmt"
	"syscall/js"
	"time"

	spec_repo "github.com/named-data/ndnd/repo/tlv"
	enc "github.com/named-data/ndnd/std/encoding"
	"github.com/named-data/ndnd/std/log"
	"github.com/named-data/ndnd/std/ndn"
	spec "github.com/named-data/ndnd/std/ndn/spec_2022"
	"github.com/named-data/ndnd/std/ndn/svs_ps"
	"github.com/named-data/ndnd/std/object"
	"github.com/named-data/ndnd/std/security"
	sig "github.com/named-data/ndnd/std/security/signer"
	"github.com/named-data/ndnd/std/security/trust_schema"
	ndn_sync "github.com/named-data/ndnd/std/sync"
	"github.com/named-data/ndnd/std/types/optional"
	jsutil "github.com/named-data/ndnd/std/utils/js"
	"github.com/pulsejet/ownly/ndn/app/tlv"
)

// TODO: find optimal value
const SnapshotThreshold = 100

// TODO: change this
var repoName, _ = enc.NameFromStr("/ndnd/ucla/repo2")

// TODO: this is testbed configuration
var multicastPrefix, _ = enc.NameFromStr("/ndn/multicast")

//go:embed schema.tlv
var SchemaBytes []byte

// JoinWorkspace joins the workspace with the given name.
// If the workspace does not exist, it will be created if create is true.
func (a *App) JoinWorkspace(wkspStr_ string, create bool) (wkspStr string, err error) {
	wkspName, err := enc.NameFromStr(wkspStr_)
	if err != nil {
		return
	}
	wkspStr = wkspName.String()

	// Connect to network
	if err = a.WaitForConnectivity(time.Second * 5); err != nil {
		return
	}

	// TODO: fetch workspace "metadata" and check for existence
	// If not existing, check the create flag and proceed

	// Get a valid identity key to sign the certificate
	idSigner, _, _ := a.GetTestbedKey()
	if idSigner == nil {
		err = fmt.Errorf("no identity key found")
		return
	}
	idName := idSigner.KeyName().Prefix(-2) // pop KeyId and KEY

	// Check if the workspace is outside our namespace
	// In that case we need to attach the invitation cross schema to certificate
	var invitation enc.Wire = nil
	if !idName.IsPrefix(wkspName) {
		// Check if we are allowed to create the workspace
		if create {
			err = fmt.Errorf("cannot create workspace outside your namespace: %s", idName)
			return
		}

		// Other namespace - check for invitation
		inviteName := wkspName.
			Append(enc.NewGenericComponent("root")).
			Append(enc.NewKeywordComponent("INVITE")).
			Append(idName...)
		log.Info(a, "Fetching workspace invite", "name", inviteName)

		// Fetch the invitation from the network
		ch := make(chan ndn.ExpressCallbackArgs)
		object.ExpressR(a.engine, ndn.ExpressRArgs{
			Name: inviteName,
			Config: &ndn.InterestConfig{
				MustBeFresh: true,
				CanBePrefix: true,
			},
			Retries:  3,
			Callback: func(args ndn.ExpressCallbackArgs) { ch <- args },
		})
		args := <-ch
		if args.Result != ndn.InterestResultData {
			err = fmt.Errorf("failed to get invitation, make sure %s is invited to %s (%s)",
				idName, wkspName, args.Result)
			return
		}

		// TODO: validate the invitation itself
		invitation = args.RawData

		log.Info(a, "Got workspace invitation", "name", wkspStr, "invite", args.Data.Name())
	} else {
		log.Info(a, "Joining workspace in own namespace", "name", wkspStr)
	}

	// Generate key and certificate for this workspace
	appIdName := wkspName.Append(idName...)
	appIdKeyName := security.MakeKeyName(appIdName)
	appIdSigner, err := sig.KeygenEcc(appIdKeyName, elliptic.P256())
	if err != nil {
		return
	}

	// Get key secret to sign certificate
	appIdSecret, err := sig.MarshalSecretToData(appIdSigner)
	if err != nil {
		return
	}

	// Create certificate for this workspace
	// TODO: limit validity to same as invite validity
	appIdCert, err := security.SignCert(security.SignCertArgs{
		Data:        appIdSecret,
		Signer:      idSigner,
		IssuerId:    enc.NewGenericComponent("self"),
		NotBefore:   time.Now().Add(-time.Hour),
		NotAfter:    time.Now().AddDate(10, 0, 0), // for now
		CrossSchema: invitation,
	})
	if err != nil {
		return
	}

	// Insert key and certificate into keychain
	if err = a.keychain.InsertKey(appIdSigner); err != nil {
		return
	}
	if err = a.keychain.InsertCert(appIdCert.Join()); err != nil {
		return
	}

	return
}

// IsWorkspaceOwner returns true if the current identity has owner permissions.
func (a *App) IsWorkspaceOwner(wkspStr string) (bool, error) {
	wkspName, err := enc.NameFromStr(wkspStr)
	if err != nil {
		return false, err
	}

	idKey, _, _ := a.GetTestbedKey()
	if idKey == nil {
		return false, fmt.Errorf("no testbed key")
	}

	// Currently this only checks if the workspace is in the identity namespace, but in the
	// future it should check for actual delegation (valid signer)
	// We don't support any owner-level delegation yet.
	idName := idKey.KeyName().Prefix(-2)
	return idName.IsPrefix(wkspName), nil
}

// GetWorkspace returns a JS object representing the workspace with the given name.
func (a *App) GetWorkspace(groupStr string) (api js.Value, err error) {
	group, err := enc.NameFromStr(groupStr)
	if err != nil {
		return
	}

	// Create trust configuration
	schema, err := trust_schema.NewLvsSchema(SchemaBytes)
	if err != nil {
		return
	}
	trust, err := security.NewTrustConfig(a.keychain, schema, []enc.Name{testbedRootName})
	if err != nil {
		return
	}
	trust.UseDataNameFwHint = true

	// Get identity key to use (same as testbed key)
	idKey, idCertData, idCertSigCov := a.GetTestbedKey()
	if idKey == nil {
		err = fmt.Errorf("no valid testbed key found")
		return
	}
	// Use testbed key to sign NFD management commands
	a.SetCmdKey(idKey)
	idName := idKey.KeyName().Prefix(-2) // pop KeyId and KEY

	// Get workspace-specific user key
	detect := group.Append(enc.NewKeywordComponent("KD"))
	userKey := trust.Suggest(detect)
	if userKey == nil {
		err = fmt.Errorf("no valid user key found")
		return
	} else {
		log.Info(a, "Found valid user key", "name", userKey.KeyName())
	}

	// Create client object for this workspace
	client := object.NewClient(a.engine, a.store, trust)

	var workspaceJs map[string]any
	workspaceJs = map[string]any{
		// name: string;
		"name": js.ValueOf(idName.String()), // wrong

		// group: string;
		"group": js.ValueOf(group.String()),

		// start(): Promise<void>;
		"start": jsutil.AsyncFunc(func(this js.Value, p []js.Value) (any, error) {
			if err := client.Start(); err != nil {
				return nil, err
			}

			// When connected to testbed, verify the identity certificate
			// (so that the certs get fetched)
			a.ExecWithConnectivity(func() {
				client.ValidateExt(ndn.ValidateExtArgs{
					Data:       idCertData,
					SigCovered: idCertSigCov,
					Callback: func(b bool, err error) {
						if err != nil {
							log.Error(a, "Failed to validate identity cert", "err", err)
						} else {
							log.Info(a, "Identity cert validated", "name", idName)
						}
					},

					// Testbed configuration - announce site CA certs directly
					UseDataNameFwHint: optional.Some(false),
				})
			})

			return nil, nil
		}),

		// stop(): Promise<void>;
		"stop": jsutil.AsyncFunc(func(this js.Value, p []js.Value) (any, error) {
			if err := client.Stop(); err != nil {
				return nil, err
			}

			jsutil.ReleaseMap(workspaceJs)
			return nil, nil
		}),

		// produce(name: string, data: Uint8Array): Promise<void>;
		"produce": jsutil.AsyncFunc(func(this js.Value, p []js.Value) (any, error) {
			name, err := enc.NameFromStr(p[0].String())
			if err != nil {
				return nil, err
			}

			_, err = client.Produce(ndn.ProduceArgs{
				Name:    name,
				Content: enc.Wire{jsutil.JsArrayToSlice(p[1])},
			})

			return nil, err
		}),

		// consume(name: string): Promise<{ data: Uint8Array; name: string; }>;
		"consume": jsutil.AsyncFunc(func(this js.Value, p []js.Value) (any, error) {
			name, err := enc.NameFromStr(p[0].String())
			if err != nil {
				return nil, err
			}

			// Fetch the content from the network
			ch := make(chan ndn.ConsumeState)
			client.ConsumeExt(ndn.ConsumeExtArgs{
				Name:     name,
				TryStore: true,
				Callback: func(state ndn.ConsumeState) { ch <- state },
			})
			state := <-ch
			if err := state.Error(); err != nil {
				return nil, err
			}

			return js.ValueOf(map[string]any{
				"data": jsutil.SliceToJsArray(state.Content().Join()),
				"name": js.ValueOf(state.Name().String()),
			}), nil
		}),

		// svs_alo(group: string, state: Uint8Array | undefined, persist_state: (state: Uint8Array) => Promise<void>): Promise<SvsAloApi>;
		"svs_alo": jsutil.AsyncFunc(func(this js.Value, p []js.Value) (any, error) {
			svsAloGroup, err := enc.NameFromStr(p[0].String())
			if err != nil {
				return nil, err
			}

			// Parse initial state
			var stateWire enc.Wire = nil
			if !p[1].IsUndefined() {
				stateWire = enc.Wire{jsutil.JsArrayToSlice(p[1])}
			}

			// Create new SVS ALO instance
			svsAlo, err := ndn_sync.NewSvsALO(ndn_sync.SvsAloOpts{
				Name:         idName,
				InitialState: stateWire,

				Svs: ndn_sync.SvSyncOpts{
					Client:      client,
					GroupPrefix: svsAloGroup,
				},

				Snapshot: &ndn_sync.SnapshotNodeHistory{
					Client:    client,
					Threshold: SnapshotThreshold,
					Compress:  CompressSnapshotYjs,
				},

				MulticastPrefix: multicastPrefix,
			})
			if err != nil {
				return nil, err
			}

			// Create JS API for SVS ALO
			return a.SvsAloJs(client, svsAlo, p[2]), nil
		}),

		// sign_invitation(invitee: string): Promise<Uint8Array>;
		"sign_invitation": jsutil.AsyncFunc(func(this js.Value, p []js.Value) (any, error) {
			invitee, err := enc.NameFromStr(p[0].String())
			if err != nil {
				return nil, err
			}

			// Make the invitation name
			// There is always a "root" project that manages the workspace,
			// so we reuse that naming convention for the invitation.
			// /<wksp>/root/32=INVITE/<invitee>/v=<time>
			inviteName := group.
				Append(enc.NewGenericComponent("root")).
				Append(enc.NewKeywordComponent("INVITE")).
				Append(invitee...).
				WithVersion(enc.VersionUnixMicro)

			// Make sure we can make this invitation
			signer := client.SuggestSigner(inviteName)
			if signer == nil {
				return nil, fmt.Errorf("no valid signing key")
			}

			wire, err := trust_schema.SignCrossSchema(trust_schema.SignCrossSchemaArgs{
				Name:   inviteName,
				Signer: signer,
				Content: trust_schema.CrossSchemaContent{
					SimpleSchemaRules: []*trust_schema.SimpleSchemaRule{{
						// Authorize invitee's identity key to sign data
						NamePrefix: group.Append(invitee...),
						KeyLocator: &spec.KeyLocator{
							Name: invitee.Append(enc.NewGenericComponent("KEY")),
						},
					}},
				},
				NotBefore: time.Now().Add(-time.Hour),
				NotAfter:  time.Now().AddDate(50, 0, 0), // for now
				Store:     client.Store(),               // auto-store
			})
			if err != nil {
				return nil, err
			}

			return jsutil.SliceToJsArray(wire.Join()), nil
		}),
	}

	return js.ValueOf(workspaceJs), nil
}

func (a *App) SvsAloJs(client ndn.Client, alo *ndn_sync.SvsALO, persistState js.Value) (api js.Value) {
	routes := []enc.Name{
		alo.SyncPrefix(),
		alo.DataPrefix(),
	}

	var svsAloJs map[string]any
	svsAloJs = map[string]any{
		"sync_prefix": js.ValueOf(alo.SyncPrefix().String()),
		"data_prefix": js.ValueOf(alo.DataPrefix().String()),

		// start(): Promise<void>;
		"start": jsutil.AsyncFunc(func(this js.Value, p []js.Value) (any, error) {
			// Announce prefixes to the network
			for _, route := range routes {
				client.AnnouncePrefix(ndn.Announcement{
					Name:    route,
					Expose:  true,
					OnError: nil, // TODO
				})
			}

			// Notify repo to start
			a.ExecWithConnectivity(func() {
				a.NotifyRepo(client, alo.GroupPrefix(), alo.DataPrefix())
			})

			if err := alo.Start(); err != nil {
				return nil, err
			}

			return nil, nil
		}),

		// stop(): Promise<void>;
		"stop": jsutil.AsyncFunc(func(this js.Value, p []js.Value) (any, error) {
			if err := alo.Stop(); err != nil {
				return nil, err
			}

			for _, route := range routes {
				client.WithdrawPrefix(route, nil)
			}

			jsutil.ReleaseMap(svsAloJs)
			return nil, nil
		}),

		// set_on_error(): Promise<void>;
		"set_on_error": js.FuncOf(func(this js.Value, p []js.Value) any {
			alo.SetOnError(func(err error) {
				p[0].Invoke(js.ValueOf(err.Error()))
			})
			return nil
		}),

		// pub_yjs_delta(binary: Uint8Array): Promise<void>;
		"pub_yjs_delta": jsutil.AsyncFunc(func(this js.Value, p []js.Value) (any, error) {
			pub := &tlv.Message{
				YjsDelta: &tlv.YjsDelta{
					UUID:   p[0].String(),
					Binary: jsutil.JsArrayToSlice(p[1]),
				},
			}

			name, state, err := alo.Publish(pub.Encode())
			if err != nil {
				return nil, err
			}

			// Persist state
			jsutil.Await(persistState.Invoke(jsutil.SliceToJsArray(state.Join())))

			return js.ValueOf(name.String()), nil
		}),

		// pub_blob_fetch(name: string, encapsulate: Uint8Array | undefined): Promise<string>;
		"pub_blob_fetch": jsutil.AsyncFunc(func(this js.Value, p []js.Value) (any, error) {
			// This message is special, in the sense that it is purely intended for repo.
			// So subscribers will never see this message.
			cmd := spec_repo.RepoCmd{
				BlobFetch: &spec_repo.BlobFetch{},
			}
			if !p[1].IsUndefined() { // encapsulate
				// For now this only supports a single encapsulated Data
				cmd.BlobFetch.Data = [][]byte{
					jsutil.JsArrayToSlice(p[1]),
				}
			} else { // pointer only
				blobName, err := enc.NameFromStr(p[0].String())
				if err != nil {
					return nil, err
				}
				cmd.BlobFetch.Name = &spec.NameContainer{Name: blobName}
			}

			blobName, state, err := alo.Publish(cmd.Encode())
			if err != nil {
				return nil, err
			}

			// Persist state
			jsutil.Await(persistState.Invoke(jsutil.SliceToJsArray(state.Join())))

			return js.ValueOf(blobName.String()), nil
		}),

		// subscribe(name: string, { on_yjs_delta }): Promise<void>;
		"subscribe": jsutil.AsyncFunc(func(this js.Value, p []js.Value) (any, error) {
			// Send a list of publications to the JS callback
			sendPub := func(pubs []ndn_sync.SvsPub) {
				yjsDeltas := js.Global().Get("Array").New()

				for _, pub := range pubs {
					pmsg, err := tlv.ParseMessage(enc.NewWireView(pub.Content), true)
					if err != nil {
						log.Error(nil, "Failed to parse publication", "err", err)
						continue
					}

					// All possible message type conversions listed here
					switch {
					case pmsg.YjsDelta != nil:
						yjsDeltas.Call("push", js.ValueOf(map[string]any{
							"uuid":   pmsg.YjsDelta.UUID,
							"binary": jsutil.SliceToJsArray(pmsg.YjsDelta.Binary),
						}))
					default:
						// This will be logged even for BlobFetch commands, which is fine
						// (can be fixed but avoid the extra parse that is unused)
						log.Warn(a, "Ignoring unknown message")
					}
				}

				if yjsDeltas.Get("length").Int() > 0 {
					jsutil.Await(p[0].Get("on_yjs_delta").Invoke(yjsDeltas))
				}
			}

			// Subscribe to the SVS instance
			alo.SubscribePublisher(enc.Name{}, func(pub ndn_sync.SvsPub) {
				if !pub.IsSnapshot {
					sendPub([]ndn_sync.SvsPub{pub})
				} else {
					snapshot, err := svs_ps.ParseHistorySnap(enc.NewWireView(pub.Content), true)
					if err != nil {
						panic(err) // we encode this, so this never happens
					}

					pubs := make([]ndn_sync.SvsPub, 0, len(snapshot.Entries))
					for _, entry := range snapshot.Entries {
						pubs = append(pubs, ndn_sync.SvsPub{
							Publisher: pub.Publisher,
							Content:   entry.Content,
							BootTime:  pub.BootTime,
							SeqNum:    entry.SeqNo,
						})
					}
					sendPub(pubs)
				}

				// Persist state
				jsutil.Await(persistState.Invoke(jsutil.SliceToJsArray(pub.State.Join())))

				return
			})
			return nil, nil
		}),

		// awareness(uuid: string): Promise<AwarenessApi>;
		"awareness": jsutil.AsyncFunc(func(this js.Value, p []js.Value) (any, error) {
			// One awareness instance per document
			suffix := enc.Name{
				enc.NewKeywordComponent("aware"),
				enc.NewGenericComponent(p[0].String()),
			}

			// Create new Awareness instance
			return a.AwarenessJs(&Awareness{
				Group:  alo.SyncPrefix().Append(suffix...),
				Name:   alo.DataPrefix().Append(suffix...),
				Client: client,
			}), nil
		}),
	}
	return js.ValueOf(svsAloJs)
}

func (a *App) AwarenessJs(awareness *Awareness) (api js.Value) {
	// Create JS API for Awareness
	var awarenessJs map[string]any
	awarenessJs = map[string]any{
		// start(): Promise<void>;
		"start": jsutil.AsyncFunc(func(this js.Value, p []js.Value) (any, error) {
			err := awareness.Start()
			return nil, err
		}),

		// stop(): Promise<void>;
		"stop": jsutil.AsyncFunc(func(this js.Value, p []js.Value) (any, error) {
			if err := awareness.Stop(); err != nil {
				return nil, err
			}
			jsutil.ReleaseMap(awarenessJs)
			return nil, nil
		}),

		// publish(data: Uint8Array): Promise<void>;
		"publish": jsutil.AsyncFunc(func(this js.Value, p []js.Value) (any, error) {
			return nil, awareness.Publish(enc.Wire{jsutil.JsArrayToSlice(p[0])})
		}),

		// subscribe(cb: (pub: Uint8Array) => void): Promise<void>;
		"subscribe": jsutil.AsyncFunc(func(this js.Value, p []js.Value) (any, error) {
			awareness.OnData = func(wire enc.Wire) {
				p[0].Invoke(jsutil.SliceToJsArray(wire.Join()))
			}
			return nil, nil
		}),
	}
	return js.ValueOf(awarenessJs)
}

func (a *App) NotifyRepo(client ndn.Client, group enc.Name, dataPrefix enc.Name) {
	// Wait for 1s so that routes get registered
	time.Sleep(time.Second)

	// Notify repo to join SVS group
	repoCmd := spec_repo.RepoCmd{
		SyncJoin: &spec_repo.SyncJoin{
			Protocol: &spec.NameContainer{Name: spec_repo.SyncProtocolSvsV3},
			Group:    &spec.NameContainer{Name: group},
			HistorySnapshot: &spec_repo.HistorySnapshotConfig{
				Threshold: SnapshotThreshold,
			},
			MulticastPrefix: &spec.NameContainer{Name: multicastPrefix},
		},
	}
	client.ExpressCommand(
		repoName,
		dataPrefix.Append(enc.NewKeywordComponent("repo-cmd")),
		repoCmd.Encode(),
		func(w enc.Wire, err error) {
			if err != nil {
				log.Warn(nil, "Repo sync join command failed", "group", group, "err", err)
			} else {
				log.Info(nil, "Repo joined SVS group", "group", group)
			}
		})
}
